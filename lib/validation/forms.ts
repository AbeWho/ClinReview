import { z } from "zod";

const text = (min: number, max: number, msg?: string) =>
  z.string().transform((s) => s.normalize("NFC").trim()).pipe(z.string().min(min, msg).max(max));

export const ProjectInputSchema = z.object({
  name: text(3, 120, "Project name must be at least 3 characters."),
  clinical_domain: text(2, 80, "Clinical domain is required."),
  description: text(0, 2000),
  dataset_purpose: text(10, 2000, "Describe the dataset goal (10+ characters)."),
  taxonomy_version_id: z.string().uuid("Choose a taxonomy version."),
  rubric_version_id: z.string().uuid("Choose a rubric version."),
  default_required_annotations: z.coerce.number().int().min(1).max(2),
  blind_annotation: z.boolean(),
});
export type ProjectInput = z.infer<typeof ProjectInputSchema>;

export const PromptVersionInputSchema = z.object({
  case_id: z.string().uuid(),
  prompt_text: text(20, 8000, "Prompt must be at least 20 characters."),
  template_key: z.string().max(60).nullable().default(null),
  tags: z.array(text(1, 40)).max(10).default([]),
  /** The version the editor started from; protects against two people saving over each other. */
  based_on_version: z.coerce.number().int().min(0),
});

export const ResponseInputSchema = z.object({
  prompt_version_id: z.string().uuid(),
  provider: text(1, 80, "Provider is required."),
  model_name: text(1, 120, "Model name is required."),
  model_version: text(1, 120, "Model version is required (use 'unspecified' if unknown)."),
  generation_settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  response_text: z.string().transform((s) => s.normalize("NFC")).pipe(z.string().trim().min(1, "Response text is required.").max(20000)),
  generated_at: z.string().datetime({ offset: true }).nullable().default(null),
});

export const QueueTaskInputSchema = z.object({
  response_id: z.string().uuid(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  required_annotations: z.coerce.number().int().min(1).max(2),
  annotator_ids: z.array(z.string().uuid()).max(2),
  due_at: z.string().datetime({ offset: true }).nullable().default(null),
});

export const ReviewInputSchema = z
  .object({
    annotation_id: z.string().uuid(),
    decision: z.enum(["approve", "needs_changes", "reject"]),
    comments: z.string().transform((s) => s.trim()).pipe(z.string().max(8000)),
    checklist: z.record(z.string(), z.boolean()).default({}),
  })
  .superRefine((v, ctx) => {
    if (v.decision !== "approve" && v.comments.length < 10) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["comments"], message: "Give actionable comments (10+ characters) when requesting changes or rejecting." });
    }
  });

export const REVIEW_CHECKLIST = [
  { key: "verdict_supported", label: "Verdict is supported by the rationale" },
  { key: "severity_justified", label: "Severity reflects plausible patient impact (not writing quality)" },
  { key: "evidence_matches", label: "Evidence spans match the labeled issues" },
  { key: "labels_distinct", label: "Omission vs. false claim vs. unsafe recommendation is distinguished" },
  { key: "uncertainty_handled", label: "Uncertainty / missing case information is acknowledged" },
] as const;
