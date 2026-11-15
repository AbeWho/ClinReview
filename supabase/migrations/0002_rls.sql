-- Row Level Security.
-- The application connects as a privileged user but, for every request, runs inside a
-- transaction that does:  set_config('app.user_id', <signed-in user>, true); SET LOCAL ROLE clinreview_app;
-- From that point Postgres itself filters every query through the policies below.
-- (On Supabase with Supabase Auth, app.uid() can be redefined to return auth.uid().)

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'clinreview_app') then
    create role clinreview_app nologin;
  end if;
end $$;
do $$ begin execute format('grant clinreview_app to %I', current_user); exception when others then null; end $$;

create or replace function app.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- SECURITY DEFINER so these helpers can read project_members without recursing through its own policy.
create or replace function app.has_role(p_project uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members m
    where m.project_id = p_project and m.user_id = app.uid() and m.role = any(p_roles)
  )
$$;

create or replace function app.is_member(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members m where m.project_id = p_project and m.user_id = app.uid())
$$;

create or replace function app.is_project_owner(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects p where p.id = p_project and p.owner_id = app.uid())
$$;

create or replace function app.is_assigned(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from task_assignments a where a.task_id = p_task and a.annotator_id = app.uid())
$$;

create or replace function app.task_finalized(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasks t where t.id = p_task and t.status = 'finalized')
$$;

grant usage on schema public, app to clinreview_app;
grant execute on all functions in schema app to clinreview_app;

-- Read access everywhere (rows still filtered by policies); writes granted narrowly.
grant select on profiles, taxonomy_versions, rubric_versions, projects, project_members, clinical_cases,
  prompts, prompt_versions, model_responses, tasks, task_assignments, annotations, annotation_evidence,
  clinical_reviews, adjudications, export_versions, export_group_splits, export_records, audit_events
  to clinreview_app;
grant insert on taxonomy_versions, rubric_versions, projects, project_members, clinical_cases, prompts,
  prompt_versions, model_responses, tasks, task_assignments, annotations, annotation_evidence,
  clinical_reviews, adjudications, export_versions, export_group_splits, export_records, audit_events
  to clinreview_app;
grant update on profiles, projects, prompts, tasks, annotations to clinreview_app;
grant delete on project_members, task_assignments, annotation_evidence to clinreview_app;
-- Deliberately NOT granted: update/delete on audit_events, responses, prompt versions, reviews, adjudications, exports.

alter table profiles enable row level security;
alter table taxonomy_versions enable row level security;
alter table rubric_versions enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table clinical_cases enable row level security;
alter table prompts enable row level security;
alter table prompt_versions enable row level security;
alter table model_responses enable row level security;
alter table tasks enable row level security;
alter table task_assignments enable row level security;
alter table annotations enable row level security;
alter table annotation_evidence enable row level security;
alter table clinical_reviews enable row level security;
alter table adjudications enable row level security;
alter table export_versions enable row level security;
alter table export_group_splits enable row level security;
alter table export_records enable row level security;
alter table audit_events enable row level security;

-- profiles: any signed-in user can see display names; only you can edit yours.
create policy profiles_select on profiles for select using (app.uid() is not null);
create policy profiles_update on profiles for update using (id = app.uid()) with check (id = app.uid());

-- taxonomy / rubric: global templates readable by everyone; project versions by members.
create policy taxonomy_select on taxonomy_versions for select
  using (project_id is null or app.is_member(project_id));
create policy taxonomy_insert on taxonomy_versions for insert
  with check (project_id is not null and app.has_role(project_id, array['owner','admin']));
create policy rubric_select on rubric_versions for select
  using (project_id is null or app.is_member(project_id));
create policy rubric_insert on rubric_versions for insert
  with check (project_id is not null and app.has_role(project_id, array['owner','admin']));

-- projects
create policy projects_select on projects for select using (app.is_member(id) or owner_id = app.uid());
create policy projects_insert on projects for insert with check (owner_id = app.uid());
create policy projects_update on projects for update
  using (app.has_role(id, array['owner','admin'])) with check (app.has_role(id, array['owner','admin']));

-- project_members: owners/admins manage; a new project's owner may add their own owner row.
create policy members_select on project_members for select using (app.is_member(project_id));
create policy members_insert on project_members for insert with check (
  app.has_role(project_id, array['owner','admin'])
  or (user_id = app.uid() and role = 'owner' and app.is_project_owner(project_id))
);
create policy members_delete on project_members for delete using (app.has_role(project_id, array['owner','admin']));

-- authoring tables: members read, owners/admins write.
create policy cases_select on clinical_cases for select using (app.is_member(project_id));
create policy cases_insert on clinical_cases for insert
  with check (app.has_role(project_id, array['owner','admin']) and created_by = app.uid());
create policy prompts_select on prompts for select using (app.is_member(project_id));
create policy prompts_insert on prompts for insert
  with check (app.has_role(project_id, array['owner','admin']) and created_by = app.uid());
create policy prompts_update on prompts for update
  using (app.has_role(project_id, array['owner','admin'])) with check (app.has_role(project_id, array['owner','admin']));
create policy prompt_versions_select on prompt_versions for select using (app.is_member(project_id));
create policy prompt_versions_insert on prompt_versions for insert
  with check (app.has_role(project_id, array['owner','admin']) and created_by = app.uid());
create policy responses_select on model_responses for select using (app.is_member(project_id));
create policy responses_insert on model_responses for insert
  with check (app.has_role(project_id, array['owner','admin']) and created_by = app.uid());

-- tasks: members read; owners/admins create; working roles may update (the service layer
-- enforces which transition each role may perform).
create policy tasks_select on tasks for select using (app.is_member(project_id));
create policy tasks_insert on tasks for insert
  with check (app.has_role(project_id, array['owner','admin']) and created_by = app.uid());
create policy tasks_update on tasks for update
  using (app.has_role(project_id, array['owner','admin','annotator','reviewer','adjudicator']))
  with check (app.has_role(project_id, array['owner','admin','annotator','reviewer','adjudicator']));

create policy assignments_select on task_assignments for select using (app.is_member(project_id));
create policy assignments_insert on task_assignments for insert
  with check (app.has_role(project_id, array['owner','admin']) and assigned_by = app.uid());
create policy assignments_delete on task_assignments for delete using (app.has_role(project_id, array['owner','admin']));

-- annotations: BLIND by default. An annotator sees only their own work; reviewers,
-- adjudicators and owners/admins see all; viewers see annotations only once a task is finalized.
create policy annotations_select on annotations for select using (
  annotator_id = app.uid()
  or app.has_role(project_id, array['owner','admin','reviewer','adjudicator'])
  or (app.has_role(project_id, array['viewer']) and app.task_finalized(task_id))
);
create policy annotations_insert on annotations for insert with check (
  annotator_id = app.uid() and status = 'draft'
  and app.has_role(project_id, array['annotator']) and app.is_assigned(task_id)
);
create policy annotations_update on annotations for update
  using (annotator_id = app.uid()) with check (annotator_id = app.uid());

-- evidence follows the visibility of its annotation (RLS applies inside the subquery).
create policy evidence_select on annotation_evidence for select
  using (exists (select 1 from annotations a where a.id = annotation_id));
create policy evidence_insert on annotation_evidence for insert
  with check (exists (select 1 from annotations a where a.id = annotation_id and a.annotator_id = app.uid()));
create policy evidence_delete on annotation_evidence for delete
  using (exists (select 1 from annotations a where a.id = annotation_id and a.annotator_id = app.uid()));

create policy reviews_select on clinical_reviews for select using (
  app.has_role(project_id, array['owner','admin','reviewer','adjudicator','viewer'])
  or exists (select 1 from annotations a where a.id = annotation_id and a.annotator_id = app.uid())
);
create policy reviews_insert on clinical_reviews for insert
  with check (reviewer_id = app.uid() and app.has_role(project_id, array['reviewer']));

create policy adjudications_select on adjudications for select using (app.is_member(project_id));
create policy adjudications_insert on adjudications for insert
  with check (adjudicator_id = app.uid() and app.has_role(project_id, array['adjudicator']));

-- exports: members may read/download; owners/admins create.
create policy exports_select on export_versions for select using (app.is_member(project_id));
create policy exports_insert on export_versions for insert
  with check (created_by = app.uid() and app.has_role(project_id, array['owner','admin']));
create policy export_splits_select on export_group_splits for select
  using (exists (select 1 from export_versions e where e.id = export_id));
create policy export_splits_insert on export_group_splits for insert
  with check (exists (select 1 from export_versions e where e.id = export_id and app.has_role(e.project_id, array['owner','admin'])));
create policy export_records_select on export_records for select
  using (exists (select 1 from export_versions e where e.id = export_id));
create policy export_records_insert on export_records for insert
  with check (exists (select 1 from export_versions e where e.id = export_id and app.has_role(e.project_id, array['owner','admin'])));

-- audit: append-only; members read their projects' events; you can only write events as yourself.
create policy audit_select on audit_events for select
  using ((project_id is null and actor_id = app.uid()) or (project_id is not null and app.is_member(project_id)));
create policy audit_insert on audit_events for insert
  with check (actor_id = app.uid() and (project_id is null or app.is_member(project_id) or app.is_project_owner(project_id)));
