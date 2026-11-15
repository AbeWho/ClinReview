import { describe, expect, it } from "vitest";
import { DEFAULT_RUBRIC, DEFAULT_TAXONOMY } from "@/lib/taxonomy/defaults";
import { RubricDefinitionSchema, TaxonomyDefinitionSchema } from "@/lib/taxonomy/schema";
import { buildAnnotationSchemas } from "@/lib/validation/annotation";
import { detectLikelyIdentifiers, ScenarioSchema } from "@/lib/validation/case";
import { scenarioHash } from "@/lib/validation/hash";

const { DraftSchema, SubmitSchema } = buildAnnotationSchemas(DEFAULT_TAXONOMY, DEFAULT_RUBRIC);
const complete = {
  labels: {
    task_type: "triage_escalation", verdict: "incorrect", safety_severity: "critical", findings: ["missed_red_flag"],
    rubric_scores: { accuracy: 1, safety: 1, reasoning: "na", completeness: 2, communication: 3 },
    escalation_recommendation: "Same-day emergency evaluation.",
  },
  rationale: "The response misses clear red flags in the vignette.",
  confidence: 0.9,
  evidence: [{ start: 0, end: 4, quote: "This" }],
};

describe("taxonomy and rubric definitions", () => {
  it("default taxonomy and rubric conform to their schemas", () => {
    expect(TaxonomyDefinitionSchema.safeParse(DEFAULT_TAXONOMY).success).toBe(true);
    expect(RubricDefinitionSchema.safeParse(DEFAULT_RUBRIC).success).toBe(true);
  });
  it("rubric has no aggregation formula, so no overall score is shown", () => {
    expect(DEFAULT_RUBRIC.aggregation).toBeNull();
  });
});

describe("annotation validation", () => {
  it("accepts an empty partial draft", () => {
    expect(DraftSchema.safeParse({ labels: {} }).success).toBe(true);
  });
  it("rejects unknown label keys even in drafts", () => {
    expect(DraftSchema.safeParse({ labels: { verdict: "maybe" } }).success).toBe(false);
  });
  it("accepts a complete submission", () => {
    const r = SubmitSchema.safeParse(complete);
    expect(r.success, JSON.stringify(!r.success && r.error.issues)).toBe(true);
  });
  it("requires verdict, severity, findings, rationale, confidence and rubric scores", () => {
    const r = SubmitSchema.safeParse({ labels: {}, rationale: "", confidence: null, evidence: [] });
    expect(r.success).toBe(false);
    const paths = !r.success ? r.error.issues.map((i) => i.path.join(".")) : [];
    for (const p of ["labels.verdict", "labels.safety_severity", "labels.findings", "rationale", "confidence", "labels.rubric_scores.accuracy"]) expect(paths).toContain(p);
  });
  it("rejects N/A for a dimension that does not allow it", () => {
    const r = SubmitSchema.safeParse({ ...complete, labels: { ...complete.labels, rubric_scores: { ...complete.labels.rubric_scores, safety: "na" } } });
    expect(r.success).toBe(false);
  });
  it("requires evidence for negative findings", () => {
    expect(SubmitSchema.safeParse({ ...complete, evidence: [] }).success).toBe(false);
  });
  it("requires an escalation recommendation for red flags", () => {
    expect(SubmitSchema.safeParse({ ...complete, labels: { ...complete.labels, escalation_recommendation: "" } }).success).toBe(false);
  });
  it("rejects unsafe recommendation with severity none", () => {
    const r = SubmitSchema.safeParse({ ...complete, labels: { ...complete.labels, findings: ["unsafe_recommendation"], safety_severity: "none" } });
    expect(r.success).toBe(false);
  });
  it("requires a reference date when a citation is given", () => {
    const r = SubmitSchema.safeParse({ ...complete, labels: { ...complete.labels, reference: { citation: "Some guideline", url: "", reference_date: "" } } });
    expect(r.success).toBe(false);
  });
  it("allows 'cannot assess' without evidence", () => {
    const r = SubmitSchema.safeParse({ ...complete, labels: { ...complete.labels, verdict: "cannot_assess", findings: ["ambiguity"], safety_severity: "low" }, evidence: [] });
    expect(r.success).toBe(true);
  });
});

describe("case validation", () => {
  const scenario = { age_band: "60-69", sex: "female", chief_complaint: "Dyspnea", hpi: "Three days of dyspnea.", vitals: {}, comorbidities: "HFrEF\nCKD 3\n" };
  it("normalizes multi-line lists", () => {
    expect(ScenarioSchema.parse(scenario).comorbidities).toEqual(["HFrEF", "CKD 3"]);
  });
  it("produces a stable content hash regardless of key order", () => {
    const a = ScenarioSchema.parse(scenario);
    const b = ScenarioSchema.parse(Object.fromEntries(Object.entries(scenario).reverse()));
    expect(scenarioHash(a)).toBe(scenarioHash(b));
  });
  it("flags obvious identifiers", () => {
    expect(detectLikelyIdentifiers({ hpi: "Call 555-123-4567, MRN: 12345678, DOB 03/14/1961" })).toEqual(
      expect.arrayContaining(["phone number", "medical record number", "date of birth label"]),
    );
    expect(detectLikelyIdentifiers({ hpi: "Patient in the 60-69 age band with dyspnea." })).toEqual([]);
  });
});
