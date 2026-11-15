import { z } from "zod";

const key = z.string().regex(/^[a-z][a-z0-9_]*$/, "keys are snake_case");

export const TaxonomyDefinitionSchema = z.object({
  task_types: z.array(z.object({ key, label: z.string(), definition: z.string() })).min(1),
  findings: z
    .array(
      z.object({
        key,
        label: z.string(),
        definition: z.string(),
        example: z.string(),
        non_example: z.string(),
        decision_rule: z.string(),
        /** Findings that indicate the response is problematic (used for consistency checks). */
        negative: z.boolean(),
      }),
    )
    .min(1),
  severities: z.array(z.object({ key, label: z.string(), rank: z.number().int(), criteria: z.string() })).min(2),
  verdicts: z.array(z.object({ key, label: z.string(), definition: z.string() })).min(2),
  question_flags: z.array(z.object({ key, label: z.string(), definition: z.string() })),
});
export type TaxonomyDefinition = z.infer<typeof TaxonomyDefinitionSchema>;

export const RubricDefinitionSchema = z.object({
  dimensions: z
    .array(
      z.object({
        key,
        label: z.string(),
        definition: z.string(),
        allow_na: z.boolean(),
        anchors: z.object({ "1": z.string(), "2": z.string(), "3": z.string(), "4": z.string(), "5": z.string() }),
      }),
    )
    .min(1),
  /** null = no documented aggregation formula, so the UI must not show an overall score. */
  aggregation: z.null(),
});
export type RubricDefinition = z.infer<typeof RubricDefinitionSchema>;
