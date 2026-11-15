import { describe, expect, it } from "vitest";
import { deriveTaskState, type AnnotationFact } from "@/lib/workflow/task-status";

const ann = (o: Partial<AnnotationFact>): AnnotationFact => ({
  id: o.id ?? "a1", annotatorId: o.annotatorId ?? "u1", revision: 1, status: "submitted", reviewDecision: null,
  verdict: "correct", severity: "none", submittedAt: new Date("2025-01-01"), ...o,
});

describe("deriveTaskState", () => {
  it("is queued with no assignments or annotations", () => {
    expect(deriveTaskState({ requiredAnnotations: 1, assignmentCount: 0, latest: [], adjudicated: false }).status).toBe("queued");
  });
  it("is in progress once assigned or drafting", () => {
    expect(deriveTaskState({ requiredAnnotations: 1, assignmentCount: 1, latest: [], adjudicated: false }).status).toBe("in_progress");
    expect(deriveTaskState({ requiredAnnotations: 1, assignmentCount: 1, latest: [ann({ status: "draft" })], adjudicated: false }).status).toBe("in_progress");
  });
  it("waits for review after enough submissions", () => {
    expect(deriveTaskState({ requiredAnnotations: 1, assignmentCount: 1, latest: [ann({})], adjudicated: false }).status).toBe("in_review");
  });
  it("stays in progress until BOTH required annotations are submitted", () => {
    const s = deriveTaskState({ requiredAnnotations: 2, assignmentCount: 2, latest: [ann({ reviewDecision: "approve" }), ann({ id: "a2", annotatorId: "u2", status: "draft" })], adjudicated: false });
    expect(s.status).toBe("in_progress");
  });
  it("goes to changes_requested when sent back, and stays there during the revision draft", () => {
    expect(deriveTaskState({ requiredAnnotations: 1, assignmentCount: 1, latest: [ann({ reviewDecision: "needs_changes" })], adjudicated: false }).status).toBe("changes_requested");
    expect(deriveTaskState({ requiredAnnotations: 1, assignmentCount: 1, latest: [ann({ status: "draft", revision: 2 })], adjudicated: false }).status).toBe("changes_requested");
  });
  it("finalizes a single approved annotation via review", () => {
    const s = deriveTaskState({ requiredAnnotations: 1, assignmentCount: 1, latest: [ann({ reviewDecision: "approve" })], adjudicated: false });
    expect(s).toMatchObject({ status: "finalized", finalizedVia: "review", finalAnnotationId: "a1" });
  });
  it("finalizes by consensus when two approved annotations agree on verdict and severity", () => {
    const s = deriveTaskState({ requiredAnnotations: 2, assignmentCount: 2, adjudicated: false, latest: [
      ann({ reviewDecision: "approve", submittedAt: new Date("2025-01-02") }),
      ann({ id: "a2", annotatorId: "u2", reviewDecision: "approve", submittedAt: new Date("2025-01-01") }),
    ] });
    expect(s).toMatchObject({ status: "finalized", finalizedVia: "consensus", finalAnnotationId: "a2" });
  });
  it("requires adjudication when approved annotations disagree", () => {
    const s = deriveTaskState({ requiredAnnotations: 2, assignmentCount: 2, adjudicated: false, latest: [
      ann({ reviewDecision: "approve" }), ann({ id: "a2", annotatorId: "u2", reviewDecision: "approve", verdict: "partially_correct" }),
    ] });
    expect(s).toMatchObject({ status: "adjudication", disagreement: true });
  });
  it("is finalized via adjudication once adjudicated", () => {
    expect(deriveTaskState({ requiredAnnotations: 2, assignmentCount: 2, latest: [], adjudicated: true })).toMatchObject({ status: "finalized", finalizedVia: "adjudication" });
  });
});
