import { UUID_RE, type Tx } from "@/lib/db/types";
import { ScenarioSchema, type Scenario } from "@/lib/validation/case";
import { QueueTaskInputSchema } from "@/lib/validation/forms";
import { deriveTaskState, type AnnotationFact, type ReviewDecision, type TaskStatus } from "@/lib/workflow/task-status";
import { AppError, audit, getProjectRoles, one, parseOrThrow, requireActiveProject, requireCapability, type Actor } from "./core";

/**
 * Recompute and persist a task's status from the underlying records. Called at the end of every
 * workflow transition, inside the same transaction, so status can never drift from the data.
 */
export async function recomputeTaskStatus(tx: Tx, actor: Actor, taskId: string) {
  const task = await one(tx.query<{ id: string; project_id: string; status: TaskStatus; required_annotations: number }>(
    "select id, project_id, status, required_annotations from tasks where id = $1 for update", [taskId]), "Task");
  const latest = await tx.query<{
    id: string; annotator_id: string; revision: number; status: AnnotationFact["status"]; decision: ReviewDecision | null;
    verdict: string | null; severity: string | null; submitted_at: Date | null;
  }>(
    `select distinct on (a.annotator_id) a.id, a.annotator_id, a.revision, a.status, r.decision,
       a.labels_json->>'verdict' as verdict, a.labels_json->>'safety_severity' as severity, a.submitted_at
     from annotations a left join clinical_reviews r on r.annotation_id = a.id
     where a.task_id = $1 order by a.annotator_id, a.revision desc`,
    [taskId],
  );
  const [{ n: assignmentCount } = { n: 0 }] = await tx.query<{ n: number }>("select count(*)::int as n from task_assignments where task_id = $1", [taskId]);
  const [{ n: adjudications } = { n: 0 }] = await tx.query<{ n: number }>("select count(*)::int as n from adjudications where task_id = $1", [taskId]);

  const next = deriveTaskState({
    requiredAnnotations: task.required_annotations,
    assignmentCount,
    adjudicated: adjudications > 0,
    latest: latest.map((a) => ({
      id: a.id, annotatorId: a.annotator_id, revision: a.revision, status: a.status, reviewDecision: a.decision,
      verdict: a.verdict, severity: a.severity, submittedAt: a.submitted_at ? new Date(a.submitted_at) : null,
    })),
  });

  if (next.status !== task.status) {
    await tx.query(
      `update tasks set status = $2, finalized_via = $3, final_annotation_id = $4,
         finalized_at = case when $2 = 'finalized' then now() else null end, updated_at = now() where id = $1`,
      [taskId, next.status, next.finalizedVia, next.finalAnnotationId],
    );
    await audit(tx, actor, { projectId: task.project_id, entityType: "task", entityId: taskId, action: "task.status_changed", before: { status: task.status }, after: { status: next.status, finalized_via: next.finalizedVia } });
  }
  return next;
}

export async function queueTask(tx: Tx, actor: Actor, input: unknown) {
  const data = parseOrThrow(QueueTaskInputSchema, input);
  const r = await one(tx.query<{ project_id: string }>("select project_id from model_responses where id = $1", [data.response_id]), "Model response");
  await requireCapability(tx, r.project_id, actor, "assign_tasks");
  await requireActiveProject(tx, r.project_id);
  const existing = await tx.query<{ id: string }>("select id from tasks where response_id = $1", [data.response_id]);
  if (existing[0]) throw new AppError("conflict", "This response is already queued for labeling.");
  if (data.annotator_ids.length > data.required_annotations) throw new AppError("invalid", `Assign at most ${data.required_annotations} annotator(s).`);

  const [task] = await tx.query<{ id: string }>(
    `insert into tasks (project_id, response_id, priority, required_annotations, due_at, created_by) values ($1,$2,$3,$4,$5,$6) returning id`,
    [r.project_id, data.response_id, data.priority, data.required_annotations, data.due_at, actor.id],
  );
  await audit(tx, actor, { projectId: r.project_id, entityType: "task", entityId: task!.id, action: "task.queued", after: { priority: data.priority, required_annotations: data.required_annotations } });
  for (const annotatorId of new Set(data.annotator_ids)) await assignAnnotator(tx, actor, task!.id, annotatorId);
  return task!.id;
}

export async function assignAnnotator(tx: Tx, actor: Actor, taskId: string, annotatorId: string) {
  const task = await one(tx.query<{ project_id: string; required_annotations: number; status: TaskStatus }>("select project_id, required_annotations, status from tasks where id = $1", [taskId]), "Task");
  await requireCapability(tx, task.project_id, actor, "assign_tasks");
  if (task.status === "finalized") throw new AppError("invalid_state", "Finalized tasks cannot be reassigned.");
  const roles = await getProjectRoles(tx, task.project_id, annotatorId);
  if (!roles.includes("annotator")) throw new AppError("invalid", "That person is not an annotator on this project.");
  const [{ n } = { n: 0 }] = await tx.query<{ n: number }>("select count(*)::int as n from task_assignments where task_id = $1", [taskId]);
  if (n >= task.required_annotations) throw new AppError("invalid_state", `This task already has ${n} of ${task.required_annotations} annotator(s) assigned.`);
  await tx.query("insert into task_assignments (task_id, project_id, annotator_id, assigned_by) values ($1,$2,$3,$4)", [taskId, task.project_id, annotatorId, actor.id]);
  await audit(tx, actor, { projectId: task.project_id, entityType: "task", entityId: taskId, action: "task.assigned", after: { annotator_id: annotatorId } });
  await recomputeTaskStatus(tx, actor, taskId);
}

export async function unassignAnnotator(tx: Tx, actor: Actor, taskId: string, annotatorId: string) {
  const task = await one(tx.query<{ project_id: string }>("select project_id from tasks where id = $1", [taskId]), "Task");
  await requireCapability(tx, task.project_id, actor, "assign_tasks");
  const started = await tx.query("select 1 from annotations where task_id = $1 and annotator_id = $2", [taskId, annotatorId]);
  if (started.length) throw new AppError("invalid_state", "This annotator has already started; their work is preserved and the assignment cannot be removed.");
  await tx.query("delete from task_assignments where task_id = $1 and annotator_id = $2", [taskId, annotatorId]);
  await audit(tx, actor, { projectId: task.project_id, entityType: "task", entityId: taskId, action: "task.unassigned", before: { annotator_id: annotatorId } });
  await recomputeTaskStatus(tx, actor, taskId);
}

/** SQL predicate (task alias `t`, actor = $1): an assigned annotator still has labeling work to do. */
export const NEEDS_MY_LABELING_SQL = `(t.status <> 'finalized'
  and exists (select 1 from task_assignments x where x.task_id = t.id and x.annotator_id = $1)
  and not exists (select 1 from annotations a where a.task_id = t.id and a.annotator_id = $1 and a.status = 'submitted'
                  and not exists (select 1 from clinical_reviews r where r.annotation_id = a.id and r.decision <> 'approve')))`;

export interface QueueRow {
  id: string;
  project_id: string;
  project_name: string;
  clinical_domain: string;
  case_id: string;
  case_title: string;
  status: TaskStatus;
  priority: string;
  required_annotations: number;
  due_at: Date | null;
  created_at: Date;
  model_name: string;
  assignees: { id: string; name: string }[];
  assigned_to_me: boolean;
  my_annotation_status: string | null;
  submitted_count: number;
  finalized_via: string | null;
  needs_my_action: boolean;
}

export interface QueueFilters {
  projectId?: string;
  status?: string;
  priority?: string;
  assignee?: "me" | "unassigned" | string;
  needsMyAction?: boolean;
}

export async function listQueue(tx: Tx, actor: Actor, f: QueueFilters = {}): Promise<QueueRow[]> {
  const where: string[] = [];
  const params: unknown[] = [actor.id];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  if (f.projectId) add("t.project_id = ?", f.projectId);
  if (f.status) add("t.status = ?", f.status);
  if (f.priority) add("t.priority = ?", f.priority);
  if (f.needsMyAction) where.push(NEEDS_MY_LABELING_SQL);
  if (f.assignee === "me") where.push("exists (select 1 from task_assignments x where x.task_id = t.id and x.annotator_id = $1)");
  else if (f.assignee === "unassigned") where.push("not exists (select 1 from task_assignments x where x.task_id = t.id)");
  else if (f.assignee && UUID_RE.test(f.assignee)) add("exists (select 1 from task_assignments x where x.task_id = t.id and x.annotator_id = ?)", f.assignee);

  return tx.query<QueueRow>(
    `select t.id, t.project_id, p.name as project_name, p.clinical_domain, c.id as case_id, c.title as case_title,
       t.status, t.priority, t.required_annotations, t.due_at, t.created_at, t.finalized_via, r.model_name,
       coalesce((select json_agg(json_build_object('id', u.id, 'name', u.display_name) order by u.display_name)
                 from task_assignments x join profiles u on u.id = x.annotator_id where x.task_id = t.id), '[]') as assignees,
       exists (select 1 from task_assignments x where x.task_id = t.id and x.annotator_id = $1) as assigned_to_me,
       (select a.status from annotations a where a.task_id = t.id and a.annotator_id = $1 order by a.revision desc limit 1) as my_annotation_status,
       (select count(distinct a.annotator_id)::int from annotations a where a.task_id = t.id and a.status = 'submitted') as submitted_count,
       ${NEEDS_MY_LABELING_SQL} as needs_my_action
     from tasks t
     join projects p on p.id = t.project_id
     join model_responses r on r.id = t.response_id
     join prompt_versions v on v.id = r.prompt_version_id
     join prompts pr on pr.id = v.prompt_id
     join clinical_cases c on c.id = pr.case_id
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by array_position(array['urgent','high','normal','low'], t.priority), t.due_at nulls last, t.created_at`,
    params,
  );
}

export interface TaskContext {
  task: { id: string; project_id: string; status: TaskStatus; priority: string; required_annotations: number; due_at: Date | null; finalized_via: string | null; final_annotation_id: string | null };
  project: { id: string; name: string; clinical_domain: string; blind_annotation: boolean; is_demo: boolean; taxonomy_version_id: string; rubric_version_id: string; status: string };
  caseRow: { id: string; title: string; scenario: Scenario; source_type: string; source_notes: string; data_classification: string; is_demo: boolean };
  prompt: { version_id: string; version_number: number; prompt_text: string; tags: string[] };
  response: { id: string; model_name: string; model_version: string; provider: string; origin: string; response_text: string; generation_settings: Record<string, unknown>; generated_at: Date | null; created_at: Date };
}

export async function getTaskContext(tx: Tx, taskId: string): Promise<TaskContext> {
  const row = await one(tx.query<Record<string, unknown>>(
    `select t.id as task_id, t.project_id, t.status, t.priority, t.required_annotations, t.due_at, t.finalized_via, t.final_annotation_id,
       p.name as project_name, p.clinical_domain, p.blind_annotation, p.is_demo as project_is_demo, p.taxonomy_version_id, p.rubric_version_id, p.status as project_status,
       c.id as case_id, c.title as case_title, c.scenario_json, c.source_type, c.source_notes, c.data_classification, c.is_demo as case_is_demo,
       v.id as version_id, v.version_number, v.prompt_text, pr.tags,
       r.id as response_id, r.model_name, r.model_version, r.provider, r.origin, r.response_text, r.generation_settings, r.generated_at, r.created_at as response_created_at
     from tasks t
     join projects p on p.id = t.project_id
     join model_responses r on r.id = t.response_id
     join prompt_versions v on v.id = r.prompt_version_id
     join prompts pr on pr.id = v.prompt_id
     join clinical_cases c on c.id = pr.case_id
     where t.id = $1`, [taskId]), "Task");
  const s = (k: string) => row[k] as string;
  return {
    task: { id: s("task_id"), project_id: s("project_id"), status: row.status as TaskStatus, priority: s("priority"), required_annotations: row.required_annotations as number, due_at: row.due_at as Date | null, finalized_via: row.finalized_via as string | null, final_annotation_id: row.final_annotation_id as string | null },
    project: { id: s("project_id"), name: s("project_name"), clinical_domain: s("clinical_domain"), blind_annotation: row.blind_annotation as boolean, is_demo: row.project_is_demo as boolean, taxonomy_version_id: s("taxonomy_version_id"), rubric_version_id: s("rubric_version_id"), status: s("project_status") },
    caseRow: { id: s("case_id"), title: s("case_title"), scenario: ScenarioSchema.parse(row.scenario_json), source_type: s("source_type"), source_notes: s("source_notes"), data_classification: s("data_classification"), is_demo: row.case_is_demo as boolean },
    prompt: { version_id: s("version_id"), version_number: row.version_number as number, prompt_text: s("prompt_text"), tags: row.tags as string[] },
    response: { id: s("response_id"), model_name: s("model_name"), model_version: s("model_version"), provider: s("provider"), origin: s("origin"), response_text: s("response_text"), generation_settings: row.generation_settings as Record<string, unknown>, generated_at: row.generated_at as Date | null, created_at: row.response_created_at as Date },
  };
}
