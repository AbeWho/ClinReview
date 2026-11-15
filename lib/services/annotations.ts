import type { Tx } from "@/lib/db/types";
import { buildAnnotationSchemas, type AnnotationDraft, type EvidenceInput } from "@/lib/validation/annotation";
import { AppError, audit, getProjectRoles, loadDefinitions, one, parseOrThrow, requireActiveProject, type Actor } from "./core";
import { recomputeTaskStatus } from "./tasks";

export interface EvidenceRow {
  id: string;
  response_start_offset: number;
  response_end_offset: number;
  quote_snapshot: string;
  issue_category: string | null;
  notes: string;
}

export interface AnnotationRow {
  id: string;
  task_id: string;
  project_id: string;
  annotator_id: string;
  annotator_name: string;
  taxonomy_version_id: string;
  rubric_version_id: string;
  revision: number;
  revises_annotation_id: string | null;
  status: "draft" | "submitted" | "superseded";
  labels_json: AnnotationDraft["labels"];
  rationale: string;
  confidence: number | null;
  lock_version: number;
  submitted_at: Date | null;
  updated_at: Date;
  created_at: Date;
  evidence: EvidenceRow[];
  review: { id: string; decision: string; comments: string; reviewer_name: string; checklist_json: Record<string, boolean>; created_at: Date } | null;
}

const ANNOTATION_SELECT = `
  select a.*, u.display_name as annotator_name,
    coalesce((select json_agg(e order by e.response_start_offset) from (
       select id, response_start_offset, response_end_offset, quote_snapshot, issue_category, notes
       from annotation_evidence where annotation_id = a.id) e), '[]') as evidence,
    (select json_build_object('id', r.id, 'decision', r.decision, 'comments', r.comments, 'checklist_json', r.checklist_json,
        'reviewer_name', ru.display_name, 'created_at', r.created_at)
     from clinical_reviews r join profiles ru on ru.id = r.reviewer_id where r.annotation_id = a.id) as review
  from annotations a join profiles u on u.id = a.annotator_id`;

/** All annotation revisions on a task that the actor may see (RLS enforces blind mode). */
export async function listTaskAnnotations(tx: Tx, taskId: string): Promise<AnnotationRow[]> {
  return tx.query<AnnotationRow>(`${ANNOTATION_SELECT} where a.task_id = $1 order by u.display_name, a.revision`, [taskId]);
}

export async function getAnnotation(tx: Tx, annotationId: string): Promise<AnnotationRow> {
  return one(tx.query<AnnotationRow>(`${ANNOTATION_SELECT} where a.id = $1`, [annotationId]), "Annotation");
}

export async function myAnnotationHistory(tx: Tx, actor: Actor, taskId: string) {
  return tx.query<AnnotationRow>(`${ANNOTATION_SELECT} where a.task_id = $1 and a.annotator_id = $2 order by a.revision desc`, [taskId, actor.id]);
}

/**
 * Open the actor's working copy for a task:
 *  - existing draft -> return it
 *  - latest submission was sent back (needs_changes/reject) -> create revision N+1 prefilled from it
 *  - nothing yet -> create revision 1
 *  - latest submission is pending review or approved -> return null (read-only)
 */
export async function startOrResumeAnnotation(tx: Tx, actor: Actor, taskId: string): Promise<string | null> {
  const task = await one(tx.query<{ project_id: string; status: string }>("select project_id, status from tasks where id = $1", [taskId]), "Task");
  const roles = await getProjectRoles(tx, task.project_id, actor.id);
  if (!roles.includes("annotator")) throw new AppError("forbidden", "Only annotators can label responses.");
  const assigned = await tx.query("select 1 from task_assignments where task_id = $1 and annotator_id = $2", [taskId, actor.id]);
  if (!assigned.length) throw new AppError("forbidden", "This task is not assigned to you.");

  const history = await myAnnotationHistory(tx, actor, taskId);
  const latest = history[0];
  if (latest?.status === "draft") return latest.id;
  if (task.status === "finalized") return null;
  await requireActiveProject(tx, task.project_id);

  if (latest?.status === "submitted") {
    const decision = latest.review?.decision;
    if (decision !== "needs_changes" && decision !== "reject") return null;
    const [row] = await tx.query<{ id: string }>(
      `insert into annotations (task_id, project_id, annotator_id, taxonomy_version_id, rubric_version_id, revision, revises_annotation_id, labels_json, rationale, confidence)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [taskId, task.project_id, actor.id, latest.taxonomy_version_id, latest.rubric_version_id, latest.revision + 1, latest.id, JSON.stringify(latest.labels_json), latest.rationale, latest.confidence],
    );
    for (const e of latest.evidence) {
      await tx.query(
        "insert into annotation_evidence (annotation_id, response_start_offset, response_end_offset, quote_snapshot, issue_category, notes) values ($1,$2,$3,$4,$5,$6)",
        [row!.id, e.response_start_offset, e.response_end_offset, e.quote_snapshot, e.issue_category, e.notes],
      );
    }
    await audit(tx, actor, { projectId: task.project_id, entityType: "annotation", entityId: row!.id, action: "annotation.revision_started", after: { revision: latest.revision + 1, revises: latest.id } });
    await recomputeTaskStatus(tx, actor, taskId);
    return row!.id;
  }

  const project = await one(tx.query<{ taxonomy_version_id: string; rubric_version_id: string }>("select taxonomy_version_id, rubric_version_id from projects where id = $1", [task.project_id]));
  const [row] = await tx.query<{ id: string }>(
    `insert into annotations (task_id, project_id, annotator_id, taxonomy_version_id, rubric_version_id) values ($1,$2,$3,$4,$5) returning id`,
    [taskId, task.project_id, actor.id, project.taxonomy_version_id, project.rubric_version_id],
  );
  await audit(tx, actor, { projectId: task.project_id, entityType: "annotation", entityId: row!.id, action: "annotation.started", after: { revision: 1 } });
  await recomputeTaskStatus(tx, actor, taskId);
  return row!.id;
}

async function loadOwnDraft(tx: Tx, actor: Actor, annotationId: string) {
  const a = await getAnnotation(tx, annotationId);
  if (a.annotator_id !== actor.id) throw new AppError("forbidden", "You can only edit your own annotation.");
  if (a.status !== "draft") throw new AppError("invalid_state", "This annotation was already submitted and is now read-only.");
  const response = await one(tx.query<{ response_text: string }>(
    "select r.response_text from tasks t join model_responses r on r.id = t.response_id where t.id = $1", [a.task_id]));
  const defs = await loadDefinitions(tx, a.taxonomy_version_id, a.rubric_version_id);
  return { a, responseText: response.response_text, schemas: buildAnnotationSchemas(defs.taxonomy, defs.rubric) };
}

function checkEvidence(evidence: EvidenceInput[], responseText: string) {
  evidence.forEach((e, i) => {
    if (e.end <= e.start || e.end > responseText.length || responseText.slice(e.start, e.end) !== e.quote) {
      throw new AppError("invalid", `Evidence #${i + 1} does not match the response text. Reselect the quote.`, { evidence: ["Evidence quote does not match the response."] });
    }
  });
}

/**
 * Autosave a draft. Uses optimistic concurrency: the client sends the lock_version it last saw;
 * if another tab saved in between, we return a conflict instead of overwriting their work.
 */
export async function saveDraft(tx: Tx, actor: Actor, annotationId: string, lockVersion: number, payload: unknown) {
  const { a, responseText, schemas } = await loadOwnDraft(tx, actor, annotationId);
  const draft = parseOrThrow(schemas.DraftSchema, payload, "Draft contains invalid values.");
  checkEvidence(draft.evidence, responseText);

  const updated = await tx.query<{ lock_version: number; updated_at: Date }>(
    `update annotations set labels_json = $3, rationale = $4, confidence = $5, lock_version = lock_version + 1, updated_at = now()
     where id = $1 and lock_version = $2 and status = 'draft' returning lock_version, updated_at`,
    [a.id, lockVersion, JSON.stringify(draft.labels), draft.rationale, draft.confidence],
  );
  if (!updated[0]) throw new AppError("conflict", "This draft was changed in another tab or window. Reload to get the latest version before continuing.");

  await tx.query("delete from annotation_evidence where annotation_id = $1", [a.id]);
  for (const e of draft.evidence) {
    await tx.query(
      "insert into annotation_evidence (annotation_id, response_start_offset, response_end_offset, quote_snapshot, issue_category, notes) values ($1,$2,$3,$4,$5,$6)",
      [a.id, e.start, e.end, e.quote, e.issue_category ?? null, e.notes ?? ""],
    );
  }
  return updated[0];
}

/** Submit = validate the full annotation, lock it, supersede the previous revision, advance the task. */
export async function submitAnnotation(tx: Tx, actor: Actor, annotationId: string, lockVersion: number) {
  const { a, responseText, schemas } = await loadOwnDraft(tx, actor, annotationId);
  await requireActiveProject(tx, a.project_id);
  if (a.lock_version !== lockVersion) throw new AppError("conflict", "This draft changed since you last saved. Reload before submitting.");

  const candidate = {
    labels: a.labels_json,
    rationale: a.rationale,
    confidence: a.confidence,
    evidence: a.evidence.map((e) => ({ start: e.response_start_offset, end: e.response_end_offset, quote: e.quote_snapshot, issue_category: e.issue_category, notes: e.notes })),
  };
  parseOrThrow(schemas.SubmitSchema, candidate, "The annotation is incomplete. Fix the listed items, then submit.");
  checkEvidence(candidate.evidence, responseText);

  if (a.revises_annotation_id) {
    await tx.query("update annotations set status = 'superseded', updated_at = now() where id = $1 and status = 'submitted'", [a.revises_annotation_id]);
  }
  const done = await tx.query<{ id: string }>(
    "update annotations set status = 'submitted', submitted_at = clock_timestamp(), lock_version = lock_version + 1, updated_at = now() where id = $1 and status = 'draft' and lock_version = $2 returning id",
    [a.id, lockVersion],
  );
  if (!done[0]) throw new AppError("conflict", "This annotation was already submitted.");

  await audit(tx, actor, {
    projectId: a.project_id, entityType: "annotation", entityId: a.id, action: "annotation.submitted",
    after: { revision: a.revision, verdict: a.labels_json.verdict, severity: a.labels_json.safety_severity, evidence_count: a.evidence.length },
  });
  return recomputeTaskStatus(tx, actor, a.task_id);
}
