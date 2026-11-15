import type { Tx } from "@/lib/db/types";
import type { Actor } from "./core";
import { NEEDS_MY_LABELING_SQL } from "./tasks";

export interface AuditRow {
  id: string;
  project_id: string | null;
  project_name: string | null;
  actor_name: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  before_summary: unknown;
  after_summary: unknown;
  created_at: Date;
}

export async function listAuditEvents(tx: Tx, opts: { projectId?: string; limit?: number } = {}): Promise<AuditRow[]> {
  const params: unknown[] = [opts.limit ?? 50];
  if (opts.projectId) params.push(opts.projectId);
  return tx.query<AuditRow>(
    `select e.*, p.name as project_name, u.display_name as actor_name
     from audit_events e left join projects p on p.id = e.project_id join profiles u on u.id = e.actor_id
     ${opts.projectId ? "where e.project_id = $2" : ""}
     order by e.created_at desc, e.id limit $1`,
    params,
  );
}

/** Dashboard KPIs: every number is a count over real rows visible to the actor (RLS-filtered). */
export async function dashboardSummary(tx: Tx, actor: Actor) {
  const [row] = await tx.query<{
    projects: number; demo_projects: number; my_open_tasks: number; reviews_due: number; adjudications_due: number; finalized: number; total_tasks: number;
  }>(
    `select
       (select count(*)::int from projects where status = 'active') as projects,
       (select count(*)::int from projects where status = 'active' and is_demo) as demo_projects,
       (select count(*)::int from tasks t where ${NEEDS_MY_LABELING_SQL}) as my_open_tasks,
       (select count(*)::int from annotations a where a.status = 'submitted' and a.annotator_id <> $1
          and not exists (select 1 from clinical_reviews r where r.annotation_id = a.id)
          and exists (select 1 from project_members m where m.project_id = a.project_id and m.user_id = $1 and m.role = 'reviewer')) as reviews_due,
       (select count(*)::int from tasks t where t.status = 'adjudication'
          and exists (select 1 from project_members m where m.project_id = t.project_id and m.user_id = $1 and m.role = 'adjudicator')) as adjudications_due,
       (select count(*)::int from tasks where status = 'finalized') as finalized,
       (select count(*)::int from tasks) as total_tasks`,
    [actor.id],
  );
  return row!;
}
