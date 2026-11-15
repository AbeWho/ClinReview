/**
 * The single place that decides a task's status. Services gather facts from the database,
 * call deriveTaskState(), and persist the result in the same transaction. No client can set
 * `status` directly.
 */
export const TASK_STATUSES = ["queued", "in_progress", "in_review", "changes_requested", "adjudication", "finalized"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type ReviewDecision = "approve" | "needs_changes" | "reject";
export type FinalizedVia = "review" | "consensus" | "adjudication";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  queued: "Queued",
  in_progress: "Labeling",
  in_review: "In review",
  changes_requested: "Changes requested",
  adjudication: "Needs adjudication",
  finalized: "Finalized",
};

/** Latest revision of one annotator's work on a task. */
export interface AnnotationFact {
  id: string;
  annotatorId: string;
  revision: number;
  status: "draft" | "submitted" | "superseded";
  reviewDecision: ReviewDecision | null;
  verdict: string | null;
  severity: string | null;
  submittedAt: Date | null;
}

export interface TaskFacts {
  requiredAnnotations: number;
  assignmentCount: number;
  latest: AnnotationFact[];
  adjudicated: boolean;
}

export interface DerivedTaskState {
  status: TaskStatus;
  finalizedVia: FinalizedVia | null;
  finalAnnotationId: string | null;
  disagreement: boolean;
}

/** Business rule: two approved annotations "agree" when verdict AND severity match. */
export function annotationsAgree(a: Pick<AnnotationFact, "verdict" | "severity">, b: Pick<AnnotationFact, "verdict" | "severity">) {
  return a.verdict === b.verdict && a.severity === b.severity;
}

export function deriveTaskState(f: TaskFacts): DerivedTaskState {
  const base = { finalizedVia: null, finalAnnotationId: null, disagreement: false };
  if (f.adjudicated) return { ...base, status: "finalized", finalizedVia: "adjudication", disagreement: true };

  const submitted = f.latest.filter((a) => a.status === "submitted");
  const approved = submitted
    .filter((a) => a.reviewDecision === "approve")
    .sort((a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0));

  const sentBack = f.latest.some(
    (a) => (a.status === "submitted" && (a.reviewDecision === "needs_changes" || a.reviewDecision === "reject")) || (a.status === "draft" && a.revision > 1),
  );
  if (sentBack) return { ...base, status: "changes_requested" };

  if (approved.length >= f.requiredAnnotations) {
    const [first, second] = approved;
    if (f.requiredAnnotations === 1 && first) return { ...base, status: "finalized", finalizedVia: "review", finalAnnotationId: first.id };
    if (first && second && annotationsAgree(first, second)) {
      return { ...base, status: "finalized", finalizedVia: "consensus", finalAnnotationId: first.id };
    }
    return { ...base, status: "adjudication", disagreement: true };
  }

  if (submitted.length >= f.requiredAnnotations) return { ...base, status: "in_review" };
  if (f.assignmentCount === 0 && f.latest.length === 0) return { ...base, status: "queued" };
  return { ...base, status: "in_progress" };
}
