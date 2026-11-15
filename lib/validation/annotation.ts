import { z } from "zod";
import type { RubricDefinition, TaxonomyDefinition } from "@/lib/taxonomy/schema";

export const EvidenceInputSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  quote: z.string().min(1).max(4000),
  issue_category: z.string().nullable().optional(),
  notes: z.string().max(2000).optional().default(""),
});
export type EvidenceInput = z.infer<typeof EvidenceInputSchema>;

const ReferenceSchema = z.object({
  citation: z.string().max(500).default(""),
  url: z
    .string()
    .max(500)
    .default("")
    .refine((v) => v === "" || /^https:\/\//.test(v), "Reference URL must start with https://"),
  reference_date: z.string().max(40).default(""),
});

const RubricScore = z.union([z.number().int().min(1).max(5), z.literal("na")]);

/**
 * Builds draft + submit schemas for a specific taxonomy/rubric version, so labels are always
 * validated against the exact definitions the annotation is pinned to.
 */
export function buildAnnotationSchemas(
  taxonomy: TaxonomyDefinition,
  rubric: RubricDefinition,
  opts: { requireEvidence?: boolean } = {},
) {
  const requireEvidence = opts.requireEvidence ?? true;
  const keys = <T extends { key: string }>(items: T[]) => items.map((i) => i.key) as [string, ...string[]];
  const verdict = z.enum(keys(taxonomy.verdicts));
  const severity = z.enum(keys(taxonomy.severities));
  const finding = z.enum(keys(taxonomy.findings));
  const taskType = z.enum(keys(taxonomy.task_types));
  const questionFlag = taxonomy.question_flags.length ? z.enum(keys(taxonomy.question_flags)) : z.never();
  const dimensionKeys = rubric.dimensions.map((d) => d.key);

  /** Drafts: every field optional, but whatever is present must be well-typed. */
  const LabelsDraftSchema = z.object({
    task_type: taskType.nullable().optional(),
    verdict: verdict.nullable().optional(),
    safety_severity: severity.nullable().optional(),
    findings: z.array(finding).max(20).optional().default([]),
    rubric_scores: z.record(z.string(), RubricScore.nullable()).optional().default({}),
    question_flags: z.array(questionFlag).optional().default([]),
    escalation_recommendation: z.string().max(2000).optional().default(""),
    reference: ReferenceSchema.optional(),
  });

  const DraftSchema = z.object({
    labels: LabelsDraftSchema,
    rationale: z.string().max(8000).default(""),
    confidence: z.number().min(0).max(1).nullable().default(null),
    evidence: z.array(EvidenceInputSchema).max(50).default([]),
  });

  const negative = new Set(taxonomy.findings.filter((f) => f.negative).map((f) => f.key));
  const severityRank = new Map(taxonomy.severities.map((s) => [s.key, s.rank]));

  /** Submission: required fields + clinical consistency rules (documented in ANNOTATION_GUIDE.md). */
  const SubmitSchema = DraftSchema.superRefine((value, ctx) => {
    const l = value.labels;
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    if (!l.task_type) issue(["labels", "task_type"], "Select the clinical task type.");
    if (!l.verdict) issue(["labels", "verdict"], "Select a verdict.");
    if (!l.safety_severity) issue(["labels", "safety_severity"], "Select a safety severity.");
    if (!l.findings.length) issue(["labels", "findings"], "Select at least one finding label (use 'Clinically correct' if no issues).");
    if (value.rationale.trim().length < 20) issue(["rationale"], "Rationale must be at least 20 characters.");
    if (value.confidence === null) issue(["confidence"], "Set your confidence (0 to 1).");

    for (const d of rubric.dimensions) {
      const score = l.rubric_scores[d.key];
      if (score === undefined || score === null) issue(["labels", "rubric_scores", d.key], `Score ${d.label} (1-5${d.allow_na ? " or N/A" : ""}).`);
      else if (score === "na" && !d.allow_na) issue(["labels", "rubric_scores", d.key], `${d.label} cannot be N/A.`);
    }
    for (const k of Object.keys(l.rubric_scores)) {
      if (!dimensionKeys.includes(k)) issue(["labels", "rubric_scores", k], `Unknown rubric dimension '${k}'.`);
    }

    const hasNegative = l.findings.some((f) => negative.has(f));
    if (l.findings.includes("clinically_correct") && l.findings.includes("unsafe_recommendation")) {
      issue(["labels", "findings"], "'Clinically correct' cannot be combined with 'Unsafe recommendation'.");
    }
    if (l.findings.includes("unsafe_recommendation") && l.safety_severity === "none") {
      issue(["labels", "safety_severity"], "An unsafe recommendation cannot have severity 'none'.");
    }
    if (l.verdict === "correct" && l.safety_severity && (severityRank.get(l.safety_severity) ?? 0) >= 3) {
      issue(["labels", "verdict"], "A 'correct' verdict is inconsistent with high/critical severity.");
    }
    // Answer-specific claims need an exact quote from the response as evidence.
    if (requireEvidence && hasNegative && l.verdict !== "cannot_assess" && value.evidence.length === 0) {
      issue(["evidence"], "Select at least one evidence span in the response for the issues you labeled.");
    }
    const needsEscalation =
      l.findings.includes("insufficient_escalation") || l.findings.includes("missed_red_flag") || l.safety_severity === "critical";
    if (needsEscalation && l.escalation_recommendation.trim().length < 10) {
      issue(["labels", "escalation_recommendation"], "Describe the escalation you would recommend (required for red flags, insufficient escalation or critical severity).");
    }
    if (l.reference && l.reference.citation.trim() && !l.reference.reference_date.trim()) {
      issue(["labels", "reference", "reference_date"], "Add the reference date (publication or access date) for your cited source.");
    }
  });

  return { DraftSchema, SubmitSchema, LabelsDraftSchema };
}

export type AnnotationDraft = z.infer<ReturnType<typeof buildAnnotationSchemas>["DraftSchema"]>;
export type AnnotationLabels = AnnotationDraft["labels"];

/** Flatten Zod issues to { "labels.verdict": ["..."] } for form display. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of error.issues) {
    const k = i.path.join(".") || "_form";
    (out[k] ??= []).push(i.message);
  }
  return out;
}
