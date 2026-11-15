import type { Tx } from "@/lib/db/types";
import { ReviewInputSchema } from "@/lib/validation/forms";
import { AppError, audit, one, parseOrThrow, requireActiveProject, requireCapability, type Actor } from "./core";
import { recomputeTaskStatus } from "./tasks";

export interface ReviewQueueRow {
  annotation_id: string;
  task_id: string;
  project_name: string;
  case_title: string;
  annotator_name: string;
  revision: number;
  verdict: string | null;
  severity: string | null;
  submitted_at: Date;
}

/** Submitted annotations without a decision, excluding the actor's own work (independence). */
export async function listReviewQueue(tx: Tx, actor: Actor): Promise<ReviewQueueRow[]> {
  return tx.query<ReviewQueueRow>(
    `select a.id as annotation_id, a.task_id, p.name as project_name, c.title as case_title, u.display_name as annotator_name,
       a.revision, a.labels_json->>'verdict' as verdict, a.labels_json->>'safety_severity' as severity, a.submitted_at
     from annotations a
     join projects p on p.id = a.project_id
     join profiles u on u.id = a.annotator_id
     join tasks t on t.id = a.task_id
     join model_responses r on r.id = t.response_id
     join prompt_versions v on v.id = r.prompt_version_id
     join prompts pr on pr.id = v.prompt_id
     join clinical_cases c on c.id = pr.case_id
     where a.status = 'submitted' and a.annotator_id <> $1
       and not exists (select 1 from clinical_reviews r2 where r2.annotation_id = a.id)
       and exists (select 1 from project_members m where m.project_id = a.project_id and m.user_id = $1 and m.role = 'reviewer')
     order by a.submitted_at`,
    [actor.id],
  );
}

export async function listRecentReviews(tx: Tx, limit = 20) {
  return tx.query<{ id: string; annotation_id: string; task_id: string; decision: string; comments: string; reviewer_name: string; annotator_name: string; case_title: string; created_at: Date }>(
    `select r.id, r.annotation_id, r.task_id, r.decision, r.comments, ru.display_name as reviewer_name, au.display_name as annotator_name, c.title as case_title, r.created_at
     from clinical_reviews r
     join profiles ru on ru.id = r.reviewer_id
     join annotations a on a.id = r.annotation_id
     join profiles au on au.id = a.annotator_id
     join tasks t on t.id = r.task_id
     join model_responses mr on mr.id = t.response_id
     join prompt_versions v on v.id = mr.prompt_version_id
     join prompts pr on pr.id = v.prompt_id
     join clinical_cases c on c.id = pr.case_id
     order by r.created_at desc limit $1`,
    [limit],
  );
}

export async function submitReview(tx: Tx, actor: Actor, input: unknown) {
  const data = parseOrThrow(ReviewInputSchema, input);
  const a = await one(tx.query<{ id: string; task_id: string; project_id: string; annotator_id: string; status: string; revision: number }>(
    "select id, task_id, project_id, annotator_id, status, revision from annotations where id = $1", [data.annotation_id]), "Annotation");
  await requireCapability(tx, a.project_id, actor, "review");
  await requireActiveProject(tx, a.project_id);
  if (a.annotator_id === actor.id) throw new AppError("forbidden", "Independent review: you cannot review your own annotation.");
  if (a.status !== "submitted") throw new AppError("invalid_state", "Only the current submitted revision can be reviewed.");
  const existing = await tx.query("select 1 from clinical_reviews where annotation_id = $1", [a.id]);
  if (existing.length) throw new AppError("conflict", "This annotation has already been reviewed.");

  const [row] = await tx.query<{ id: string }>(
    `insert into clinical_reviews (task_id, project_id, annotation_id, reviewer_id, decision, comments, checklist_json, created_at)
     values ($1,$2,$3,$4,$5,$6,$7, clock_timestamp()) returning id`,
    [a.task_id, a.project_id, a.id, actor.id, data.decision, data.comments, JSON.stringify(data.checklist)],
  );
  await audit(tx, actor, { projectId: a.project_id, entityType: "clinical_review", entityId: row!.id, action: `review.${data.decision}`, after: { annotation_id: a.id, revision: a.revision } });
  return recomputeTaskStatus(tx, actor, a.task_id);
}
