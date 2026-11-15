import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Tx } from "@/lib/db/types";
import { toCsv } from "@/lib/exports/csv";
import { CSV_COLUMNS, CSV_LOSS_NOTE, EXPORT_SCHEMA_VERSION, ExportRecordSchema, toCsvRow, type ExportRecord } from "@/lib/exports/schema";
import { assignSplit, SPLIT_ALGORITHM, SPLIT_RATIOS } from "@/lib/exports/split";
import { sha256 } from "@/lib/validation/hash";
import { STATUS_LABELS, type TaskStatus } from "@/lib/workflow/task-status";
import { AppError, audit, one, parseOrThrow, requireCapability, type Actor } from "./core";

const EXCLUSION_REASONS: Record<Exclude<TaskStatus, "finalized">, string> = {
  queued: "Not yet labeled",
  in_progress: "Labeling in progress (drafts are never exported)",
  in_review: "Awaiting mandatory clinical review",
  changes_requested: "Reviewer requested changes",
  adjudication: "Unresolved disagreement (needs adjudication)",
};

export interface EligibilityItem {
  task_id: string;
  case_title: string;
  status: TaskStatus;
  eligible: boolean;
  reason: string | null;
}

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

async function buildRecord(tx: Tx, taskId: string, splitSeed: string): Promise<ExportRecord> {
  const t = await one(tx.query<Record<string, unknown>>(
    `select t.id, t.project_id, t.finalized_via, t.final_annotation_id, t.finalized_at,
       p.clinical_domain, p.id as project_id,
       c.id as case_id, c.case_group_id, c.data_classification, c.source_type, c.scenario_json,
       pr.id as prompt_id, v.id as version_id, v.version_number, v.prompt_text,
       r.id as response_id, r.provider, r.model_name, r.model_version, r.origin, r.generation_settings, r.generated_at, r.created_at as recorded_at, r.response_text
     from tasks t join projects p on p.id = t.project_id
     join model_responses r on r.id = t.response_id
     join prompt_versions v on v.id = r.prompt_version_id
     join prompts pr on pr.id = v.prompt_id
     join clinical_cases c on c.id = pr.case_id
     where t.id = $1`, [taskId]), "Task");

  const sources = await tx.query<{ id: string; annotator_id: string; revision: number; labels_json: Record<string, unknown>; rationale: string; confidence: number | null; taxonomy_version_id: string; rubric_version_id: string; review_id: string }>(
    `select a.id, a.annotator_id, a.revision, a.labels_json, a.rationale, a.confidence, a.taxonomy_version_id, a.rubric_version_id, rv.id as review_id
     from annotations a join clinical_reviews rv on rv.annotation_id = a.id and rv.decision = 'approve'
     where a.task_id = $1 and a.status = 'submitted' order by a.submitted_at`, [taskId]);
  if (!sources.length) throw new Error("No approved annotations");

  const adjudication = t.finalized_via === "adjudication"
    ? await one(tx.query<{ id: string; final_labels_json: Record<string, unknown>; final_rationale: string; final_confidence: number | null; compared_annotation_ids: string[] }>(
        "select id, final_labels_json, final_rationale, final_confidence, compared_annotation_ids from adjudications where task_id = $1", [taskId]))
    : null;
  const finalAnnotation = adjudication ? null : sources.find((s) => s.id === t.final_annotation_id) ?? null;
  if (!adjudication && !finalAnnotation) throw new Error("Final annotation missing");

  const labels = (adjudication?.final_labels_json ?? finalAnnotation!.labels_json) as {
    task_type: string; verdict: string; safety_severity: string; findings: string[]; question_flags?: string[];
    rubric_scores: Record<string, number | "na">; escalation_recommendation?: string; reference?: { citation: string; url: string; reference_date: string };
  };
  const evidenceSourceIds = adjudication ? adjudication.compared_annotation_ids : [finalAnnotation!.id];
  const evidence = await tx.query<{ annotation_id: string; start: number; end: number; quote: string; issue_category: string | null }>(
    `select annotation_id, response_start_offset as start, response_end_offset as "end", quote_snapshot as quote, issue_category
     from annotation_evidence where annotation_id = any($1::uuid[]) order by annotation_id, response_start_offset`, [evidenceSourceIds]);

  const tv = await one(tx.query<{ version: string }>("select version from taxonomy_versions where id = $1", [sources[0]!.taxonomy_version_id]));
  const rv = await one(tx.query<{ version: string }>("select version from rubric_versions where id = $1", [sources[0]!.rubric_version_id]));
  const entityIds = [taskId, ...sources.map((s) => s.id), ...sources.map((s) => s.review_id), ...(adjudication ? [adjudication.id] : [])];
  const auditIds = (await tx.query<{ id: string }>("select id from audit_events where entity_id = any($1::uuid[]) order by created_at, id", [entityIds])).map((r) => r.id);
  const projectId = t.project_id as string;

  const record: ExportRecord = {
    schema_version: EXPORT_SCHEMA_VERSION,
    record_id: taskId,
    project_id: projectId,
    case_id: t.case_id as string,
    case_group_id: t.case_group_id as string,
    case_classification: t.data_classification as "synthetic",
    case_source_type: t.source_type as string,
    clinical_domain: t.clinical_domain as string,
    case_scenario: t.scenario_json as Record<string, unknown>,
    prompt: { prompt_id: t.prompt_id as string, version_id: t.version_id as string, version_number: t.version_number as number, text: t.prompt_text as string },
    model_response: {
      id: t.response_id as string, provider: t.provider as string, model_name: t.model_name as string, model_version: t.model_version as string,
      origin: t.origin as "manual", generation_settings: t.generation_settings as Record<string, unknown>,
      generated_at: iso(t.generated_at), recorded_at: iso(t.recorded_at)!, text: t.response_text as string,
    },
    evaluation: {
      taxonomy_version_id: sources[0]!.taxonomy_version_id, taxonomy_version: tv.version,
      rubric_version_id: sources[0]!.rubric_version_id, rubric_version: rv.version,
      task_type: labels.task_type, verdict: labels.verdict, safety_severity: labels.safety_severity, labels: labels.findings,
      question_flags: labels.question_flags ?? [], rubric_scores: labels.rubric_scores,
      rationale: adjudication?.final_rationale ?? finalAnnotation!.rationale,
      escalation_recommendation: labels.escalation_recommendation ?? "",
      reference: labels.reference?.citation ? { ...labels.reference, verified: false } : null,
      evidence, confidence: adjudication ? adjudication.final_confidence : finalAnnotation!.confidence,
      finalized_via: t.finalized_via as "review", finalized_at: iso(t.finalized_at)!,
    },
    provenance: {
      source_annotations: sources.map((s) => ({
        annotation_id: s.id, annotator_ref: `annotator-${sha256(`${projectId}:${s.annotator_id}`).slice(0, 10)}`, revision: s.revision,
        verdict: String(s.labels_json.verdict), safety_severity: String(s.labels_json.safety_severity), review_decision: "approve" as const,
      })),
      adjudication_id: adjudication?.id ?? null,
      audit_event_ids: auditIds,
      label_provenance_note: "Labels are educational/demo judgments by project members, not validated clinical ground truth.",
    },
    split: assignSplit(t.case_group_id as string, splitSeed),
  };
  return record;
}

/** Pre-flight: which tasks are eligible and why the others are excluded. */
export async function computeEligibility(tx: Tx, actor: Actor, projectId: string, splitSeed = "preview") {
  await requireCapability(tx, projectId, actor, "view");
  const tasks = await tx.query<{ id: string; status: TaskStatus; case_title: string; data_classification: string }>(
    `select t.id, t.status, c.title as case_title, c.data_classification from tasks t
     join model_responses r on r.id = t.response_id join prompt_versions v on v.id = r.prompt_version_id
     join prompts pr on pr.id = v.prompt_id join clinical_cases c on c.id = pr.case_id
     where t.project_id = $1 order by c.title`, [projectId]);
  const items: EligibilityItem[] = [];
  const records: ExportRecord[] = [];
  for (const t of tasks) {
    if (t.status !== "finalized") { items.push({ task_id: t.id, case_title: t.case_title, status: t.status, eligible: false, reason: EXCLUSION_REASONS[t.status] }); continue; }
    if (t.data_classification !== "synthetic") { items.push({ task_id: t.id, case_title: t.case_title, status: t.status, eligible: false, reason: "Case is not classified as synthetic" }); continue; }
    try {
      const rec = await buildRecord(tx, t.id, splitSeed);
      const check = ExportRecordSchema.safeParse(rec);
      if (!check.success) {
        items.push({ task_id: t.id, case_title: t.case_title, status: t.status, eligible: false, reason: `Failed schema validation: ${check.error.issues.slice(0, 2).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` });
        continue;
      }
      records.push(check.data);
      items.push({ task_id: t.id, case_title: t.case_title, status: t.status, eligible: true, reason: null });
    } catch (e) {
      items.push({ task_id: t.id, case_title: t.case_title, status: t.status, eligible: false, reason: `Could not assemble record: ${(e as Error).message}` });
    }
  }
  const reasonCounts: Record<string, number> = {};
  for (const i of items) if (!i.eligible && i.reason) reasonCounts[i.reason] = (reasonCounts[i.reason] ?? 0) + 1;
  return { items, records, eligibleCount: records.length, excludedCount: items.length - records.length, reasonCounts, statusLabels: STATUS_LABELS };
}

function nextSemver(existing: string[]): string {
  if (!existing.length) return "1.0.0";
  const sorted = existing.map((v) => v.split(".").map(Number) as [number, number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const [maj, min] = sorted[sorted.length - 1]!;
  return `${maj}.${min + 1}.0`;
}

const CreateExportInput = z.object({
  project_id: z.string().uuid(),
  split_seed: z.string().trim().min(1).max(64).regex(/^[\w.-]+$/, "Seed may contain letters, numbers, dot, dash and underscore."),
  semantic_version: z.string().regex(/^\d+\.\d+\.\d+$/, "Use semantic version format, e.g. 1.2.0").optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().max(1000).default(""),
});

export async function createExport(tx: Tx, actor: Actor, input: unknown) {
  const data = parseOrThrow(CreateExportInput, input);
  await requireCapability(tx, data.project_id, actor, "export");
  const project = await one(tx.query<{ name: string; is_demo: boolean; taxonomy_version_id: string; rubric_version_id: string }>(
    "select name, is_demo, taxonomy_version_id, rubric_version_id from projects where id = $1", [data.project_id]), "Project");
  const { records, items, excludedCount, reasonCounts } = await computeEligibility(tx, actor, data.project_id, data.split_seed);
  if (!records.length) throw new AppError("invalid_state", "No eligible finalized records to export yet.");

  const existing = (await tx.query<{ semantic_version: string }>("select semantic_version from export_versions where project_id = $1", [data.project_id])).map((r) => r.semantic_version);
  const version = data.semantic_version ?? nextSemver(existing);
  if (existing.includes(version)) throw new AppError("conflict", `Version ${version} already exists. Export versions are immutable.`);

  records.sort((a, b) => a.record_id.localeCompare(b.record_id));
  const jsonl = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const csv = toCsv([...CSV_COLUMNS], records.map(toCsvRow));
  const contentHash = sha256(jsonl);
  const splitCounts = { train: 0, validation: 0, test: 0 };
  for (const r of records) splitCounts[r.split]++;

  const id = randomUUID();
  const manifest = {
    export_id: id,
    project_id: data.project_id,
    project_name: project.name,
    is_demo_data: project.is_demo,
    semantic_version: version,
    schema_version: EXPORT_SCHEMA_VERSION,
    taxonomy_version_ids: [...new Set(records.map((r) => r.evaluation.taxonomy_version_id))],
    rubric_version_ids: [...new Set(records.map((r) => r.evaluation.rubric_version_id))],
    created_at: new Date().toISOString(),
    created_by: actor.id,
    record_count: records.length,
    excluded_count: excludedCount,
    exclusions_by_reason: reasonCounts,
    excluded_task_ids: items.filter((i) => !i.eligible).map((i) => i.task_id),
    split: { seed: data.split_seed, algorithm: SPLIT_ALGORITHM, ratios: SPLIT_RATIOS, unit: "case_group_id", counts: splitCounts },
    checksum: { algorithm: "sha256", target: "jsonl", value: contentHash },
    csv_note: CSV_LOSS_NOTE,
    notes: data.notes,
    disclaimer: "For AI evaluation research and education. Not for diagnosis, treatment, or direct patient care. Synthetic data only.",
  };

  await tx.query(
    `insert into export_versions (id, project_id, semantic_version, schema_version, split_seed, manifest_json, record_count, excluded_count, content_hash, jsonl_content, csv_content, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, data.project_id, version, EXPORT_SCHEMA_VERSION, data.split_seed, JSON.stringify(manifest), records.length, excludedCount, contentHash, jsonl, csv, actor.id],
  );
  const groups = new Map(records.map((r) => [r.case_group_id, r.split]));
  for (const [groupId, split] of groups) await tx.query("insert into export_group_splits (export_id, case_group_id, split) values ($1,$2,$3)", [id, groupId, split]);
  for (const r of records) {
    await tx.query("insert into export_records (export_id, task_id, case_group_id, split, item_hash) values ($1,$2,$3,$4,$5)", [id, r.record_id, r.case_group_id, r.split, sha256(JSON.stringify(r))]);
  }
  await audit(tx, actor, { projectId: data.project_id, entityType: "export_version", entityId: id, action: "export.created", after: { version, record_count: records.length, excluded: excludedCount, checksum: contentHash.slice(0, 16) } });
  return { id, version, contentHash, recordCount: records.length };
}

export async function listExports(tx: Tx, projectId?: string) {
  return tx.query<{ id: string; project_id: string; project_name: string; semantic_version: string; schema_version: string; split_seed: string; record_count: number; excluded_count: number; content_hash: string; created_by_name: string; created_at: Date; manifest_json: Record<string, unknown> }>(
    `select e.id, e.project_id, p.name as project_name, e.semantic_version, e.schema_version, e.split_seed, e.record_count, e.excluded_count, e.content_hash, e.manifest_json, u.display_name as created_by_name, e.created_at
     from export_versions e join projects p on p.id = e.project_id join profiles u on u.id = e.created_by
     ${projectId ? "where e.project_id = $1" : ""} order by e.created_at desc`,
    projectId ? [projectId] : [],
  );
}

export async function getExportArtifact(tx: Tx, actor: Actor, exportId: string, format: "jsonl" | "csv" | "manifest") {
  const e = await one(tx.query<{ project_id: string; semantic_version: string; jsonl_content: string; csv_content: string; manifest_json: unknown }>(
    "select project_id, semantic_version, jsonl_content, csv_content, manifest_json from export_versions where id = $1", [exportId]), "Export");
  await requireCapability(tx, e.project_id, actor, "view");
  await audit(tx, actor, { projectId: e.project_id, entityType: "export_version", entityId: exportId, action: "export.downloaded", after: { format } });
  const base = `clinreview-${e.semantic_version}`;
  if (format === "jsonl") return { body: e.jsonl_content, filename: `${base}.jsonl`, contentType: "application/x-ndjson; charset=utf-8" };
  if (format === "csv") return { body: e.csv_content, filename: `${base}.csv`, contentType: "text/csv; charset=utf-8" };
  return { body: JSON.stringify(e.manifest_json, null, 2), filename: `${base}.manifest.json`, contentType: "application/json; charset=utf-8" };
}
