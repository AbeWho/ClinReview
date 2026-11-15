import type { Tx } from "@/lib/db/types";
import { agreementStats, countBy, median } from "@/lib/reports/agreement";
import { TASK_STATUSES, type TaskStatus } from "@/lib/workflow/task-status";
import { requireCapability, type Actor } from "./core";
import { computeEligibility } from "./exports";

export async function projectReport(tx: Tx, actor: Actor, projectId: string) {
  await requireCapability(tx, projectId, actor, "view");

  const statusRows = await tx.query<{ status: TaskStatus; n: number }>("select status, count(*)::int as n from tasks where project_id = $1 group by status", [projectId]);
  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, statusRows.find((r) => r.status === s)?.n ?? 0])) as Record<TaskStatus, number>;
  const totalTasks = Object.values(byStatus).reduce((a, b) => a + b, 0);

  const finals = await tx.query<{ labels: { verdict?: string; safety_severity?: string; findings?: string[] }; finalized_via: string }>(
    `select coalesce(ad.final_labels_json, a.labels_json) as labels, t.finalized_via
     from tasks t left join adjudications ad on ad.task_id = t.id left join annotations a on a.id = t.final_annotation_id
     where t.project_id = $1 and t.status = 'finalized'`, [projectId]);

  const pairsRows = await tx.query<{ task_id: string; verdicts: string[]; severities: string[] }>(
    `select a.task_id, array_agg(a.labels_json->>'verdict' order by a.submitted_at) as verdicts,
       array_agg(a.labels_json->>'safety_severity' order by a.submitted_at) as severities
     from annotations a join clinical_reviews r on r.annotation_id = a.id and r.decision = 'approve'
     where a.project_id = $1 and a.status = 'submitted' group by a.task_id having count(*) >= 2`, [projectId]);

  const reviews = await tx.query<{ decision: string; hours: number }>(
    `select r.decision, extract(epoch from (r.created_at - a.submitted_at)) / 3600.0 as hours
     from clinical_reviews r join annotations a on a.id = r.annotation_id where r.project_id = $1`, [projectId]);

  const eligibility = await computeEligibility(tx, actor, projectId);

  return {
    totalTasks,
    byStatus,
    finalizedCount: finals.length,
    finalizedVia: countBy(finals.map((f) => f.finalized_via)),
    verdicts: countBy(finals.map((f) => f.labels.verdict ?? "unknown")),
    severities: countBy(finals.map((f) => f.labels.safety_severity ?? "unknown")),
    findings: countBy(finals.flatMap((f) => f.labels.findings ?? [])),
    verdictAgreement: agreementStats(pairsRows.map((p) => [p.verdicts[0]!, p.verdicts[1]!])),
    severityAgreement: agreementStats(pairsRows.map((p) => [p.severities[0]!, p.severities[1]!])),
    reviewDecisions: countBy(reviews.map((r) => r.decision)),
    reviewTurnaroundMedianHours: median(reviews.map((r) => Number(r.hours))),
    reviewCount: reviews.length,
    exportReadiness: { eligible: eligibility.eligibleCount, excluded: eligibility.excludedCount, reasons: eligibility.reasonCounts },
  };
}
