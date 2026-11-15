import { z } from "zod";

export const EXPORT_SCHEMA_VERSION = "1.0.0";

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });

/** Published schema for one JSONL line. Every exported record is validated against it. */
export const ExportRecordSchema = z.object({
  schema_version: z.literal(EXPORT_SCHEMA_VERSION),
  record_id: uuid, // task id
  project_id: uuid,
  case_id: uuid,
  case_group_id: uuid,
  case_classification: z.literal("synthetic"),
  case_source_type: z.string(),
  clinical_domain: z.string(),
  case_scenario: z.record(z.string(), z.unknown()),
  prompt: z.object({ prompt_id: uuid, version_id: uuid, version_number: z.number().int().min(1), text: z.string().min(1) }),
  model_response: z.object({
    id: uuid, provider: z.string(), model_name: z.string(), model_version: z.string(), origin: z.enum(["manual", "provider", "seed"]),
    generation_settings: z.record(z.string(), z.unknown()), generated_at: iso.nullable(), recorded_at: iso, text: z.string().min(1),
  }),
  evaluation: z.object({
    taxonomy_version_id: uuid, taxonomy_version: z.string(), rubric_version_id: uuid, rubric_version: z.string(),
    task_type: z.string(),
    verdict: z.string(),
    safety_severity: z.string(),
    labels: z.array(z.string()).min(1),
    question_flags: z.array(z.string()),
    rubric_scores: z.record(z.string(), z.union([z.number().int().min(1).max(5), z.literal("na")])),
    rationale: z.string().min(1),
    escalation_recommendation: z.string(),
    reference: z.object({ citation: z.string(), url: z.string(), reference_date: z.string(), verified: z.literal(false) }).nullable(),
    evidence: z.array(z.object({ annotation_id: uuid, start: z.number().int(), end: z.number().int(), quote: z.string(), issue_category: z.string().nullable() })),
    confidence: z.number().min(0).max(1).nullable(),
    finalized_via: z.enum(["review", "consensus", "adjudication"]),
    finalized_at: iso,
  }),
  provenance: z.object({
    source_annotations: z.array(z.object({ annotation_id: uuid, annotator_ref: z.string(), revision: z.number().int(), verdict: z.string(), safety_severity: z.string(), review_decision: z.literal("approve") })).min(1),
    adjudication_id: uuid.nullable(),
    audit_event_ids: z.array(uuid),
    label_provenance_note: z.string(),
  }),
  split: z.enum(["train", "validation", "test"]),
});
export type ExportRecord = z.infer<typeof ExportRecordSchema>;

export const CSV_COLUMNS = [
  "record_id", "split", "case_id", "case_group_id", "clinical_domain", "prompt_version_id", "prompt_text",
  "response_id", "model_name", "model_version", "response_origin", "response_text",
  "task_type", "verdict", "safety_severity", "labels", "question_flags",
  "score_accuracy", "score_safety", "score_reasoning", "score_completeness", "score_communication",
  "confidence", "rationale", "escalation_recommendation", "evidence_count", "evidence_quotes", "finalized_via",
  "taxonomy_version", "rubric_version", "schema_version",
] as const;

export const CSV_LOSS_NOTE =
  "CSV is a flattened convenience view. Lost vs JSONL: structured case scenario, evidence offsets/notes, reference details, generation settings, per-annotation provenance and audit ids. Multi-value fields are joined with ' | '. Use JSONL as the source of truth.";

export function toCsvRow(r: ExportRecord): Record<string, unknown> {
  const s = r.evaluation.rubric_scores;
  return {
    record_id: r.record_id, split: r.split, case_id: r.case_id, case_group_id: r.case_group_id, clinical_domain: r.clinical_domain,
    prompt_version_id: r.prompt.version_id, prompt_text: r.prompt.text, response_id: r.model_response.id,
    model_name: r.model_response.model_name, model_version: r.model_response.model_version, response_origin: r.model_response.origin,
    response_text: r.model_response.text, task_type: r.evaluation.task_type, verdict: r.evaluation.verdict, safety_severity: r.evaluation.safety_severity,
    labels: r.evaluation.labels.join(" | "), question_flags: r.evaluation.question_flags.join(" | "),
    score_accuracy: s.accuracy, score_safety: s.safety, score_reasoning: s.reasoning, score_completeness: s.completeness, score_communication: s.communication,
    confidence: r.evaluation.confidence, rationale: r.evaluation.rationale, escalation_recommendation: r.evaluation.escalation_recommendation,
    evidence_count: r.evaluation.evidence.length, evidence_quotes: r.evaluation.evidence.map((e) => e.quote).join(" | "),
    finalized_via: r.evaluation.finalized_via, taxonomy_version: r.evaluation.taxonomy_version, rubric_version: r.evaluation.rubric_version, schema_version: r.schema_version,
  };
}
