import { z } from "zod";
import type { Tx } from "@/lib/db/types";
import { buildAnnotationSchemas } from "@/lib/validation/annotation";
import { AppError, audit, loadDefinitions, one, parseOrThrow, requireActiveProject, requireCapability, type Actor } from "./core";
import { recomputeTaskStatus } from "./tasks";

export async function listAdjudicationQueue(tx: Tx) {
  return tx.query<{ task_id: string; project_name: string; case_title: string; updated_at: Date; verdicts: string[] }>(
    `select t.id as task_id, p.name as project_name, c.title as case_title, t.updated_at,
       coalesce((select array_agg(a.labels_json->>'verdict' order by a.submitted_at) from annotations a where a.task_id = t.id and a.status = 'submitted'), '{}') as verdicts
     from tasks t join projects p on p.id = t.project_id
     join model_responses r on r.id = t.response_id
     join prompt_versions v on v.id = r.prompt_version_id
     join prompts pr on pr.id = v.prompt_id
     join clinical_cases c on c.id = pr.case_id
     where t.status = 'adjudication' order by t.updated_at`,
  );
}

export async function listCompletedAdjudications(tx: Tx, limit = 20) {
  return tx.query<{ id: string; task_id: string; case_title: string; adjudicator_name: string; final_verdict: string; reason: string; created_at: Date }>(
    `select ad.id, ad.task_id, c.title as case_title, u.display_name as adjudicator_name, ad.final_labels_json->>'verdict' as final_verdict, ad.reason, ad.created_at
     from adjudications ad join profiles u on u.id = ad.adjudicator_id
     join tasks t on t.id = ad.task_id
     join model_responses r on r.id = t.response_id
     join prompt_versions v on v.id = r.prompt_version_id
     join prompts pr on pr.id = v.prompt_id
     join clinical_cases c on c.id = pr.case_id
     order by ad.created_at desc limit $1`,
    [limit],
  );
}

export async function getAdjudication(tx: Tx, taskId: string) {
  const [row] = await tx.query<{ id: string; adjudicator_name: string; compared_annotation_ids: string[]; final_labels_json: Record<string, unknown>; final_rationale: string; final_confidence: number | null; reason: string; created_at: Date }>(
    `select ad.*, u.display_name as adjudicator_name from adjudications ad join profiles u on u.id = ad.adjudicator_id where ad.task_id = $1`,
    [taskId],
  );
  return row ?? null;
}

const AdjudicationInput = z.object({
  task_id: z.string().uuid(),
  reason: z.string().trim().min(20, "Reconciliation note must be at least 20 characters.").max(8000),
  final: z.unknown(),
});

/**
 * Resolve a disagreement. Both independent annotations stay untouched (they are immutable);
 * the adjudication stores which ones were compared, the final label set and the reason.
 */
export async function submitAdjudication(tx: Tx, actor: Actor, input: unknown) {
  const data = parseOrThrow(AdjudicationInput, input);
  const task = await one(tx.query<{ id: string; project_id: string; status: string; taxonomy_version_id: string; rubric_version_id: string }>(
    `select t.id, t.project_id, t.status, p.taxonomy_version_id, p.rubric_version_id from tasks t join projects p on p.id = t.project_id where t.id = $1`, [data.task_id]), "Task");
  await requireCapability(tx, task.project_id, actor, "adjudicate");
  await requireActiveProject(tx, task.project_id);
  if (task.status !== "adjudication") throw new AppError("invalid_state", "This task is not awaiting adjudication.");

  const compared = await tx.query<{ id: string; annotator_id: string; taxonomy_version_id: string; rubric_version_id: string }>(
    `select a.id, a.annotator_id, a.taxonomy_version_id, a.rubric_version_id from annotations a
     join clinical_reviews r on r.annotation_id = a.id and r.decision = 'approve'
     where a.task_id = $1 and a.status = 'submitted' order by a.submitted_at`, [task.id]);
  if (compared.length < 2) throw new AppError("invalid_state", "Adjudication requires at least two approved independent annotations.");
  if (compared.some((c) => c.annotator_id === actor.id)) throw new AppError("forbidden", "You cannot adjudicate a task you annotated.");

  const defs = await loadDefinitions(tx, compared[0]!.taxonomy_version_id, compared[0]!.rubric_version_id);
  const { SubmitSchema } = buildAnnotationSchemas(defs.taxonomy, defs.rubric, { requireEvidence: false });
  // Final labels meet the same completeness rules as an annotation; evidence spans stay on the
  // compared source annotations (referenced by id), so they are not re-entered here.
  const final = parseOrThrow(SubmitSchema, { ...(data.final as object), evidence: [] }, "Final labels are incomplete.");

  const [row] = await tx.query<{ id: string }>(
    `insert into adjudications (task_id, project_id, adjudicator_id, compared_annotation_ids, final_labels_json, final_rationale, final_confidence, reason)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [task.id, task.project_id, actor.id, compared.map((c) => c.id), JSON.stringify(final.labels), final.rationale, final.confidence, data.reason],
  );
  await audit(tx, actor, { projectId: task.project_id, entityType: "adjudication", entityId: row!.id, action: "adjudication.finalized", after: { compared: compared.map((c) => c.id), verdict: final.labels.verdict, severity: final.labels.safety_severity } });
  return recomputeTaskStatus(tx, actor, task.id);
}
