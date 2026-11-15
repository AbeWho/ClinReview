-- Milestone 3 completion: editable cases (until a prompt is built from them) and safer project edits.

-- Cases: owners/admins may edit, but only while no prompt references the case. After that the
-- case is frozen so every prompt version and model response keeps pointing at the exact scenario.
grant update (title, scenario_json, source_notes, content_hash, updated_at) on clinical_cases to clinreview_app;

create policy cases_update on clinical_cases for update
  using (app.has_role(project_id, array['owner','admin']))
  with check (app.has_role(project_id, array['owner','admin']));

create or replace function app.guard_case_edit() returns trigger language plpgsql as $$
begin
  if exists (select 1 from prompts p where p.case_id = old.id) then
    raise exception 'case % already has a prompt and is frozen; create a new case instead', old.id using errcode = 'P0001';
  end if;
  if new.project_id <> old.project_id or new.case_group_id <> old.case_group_id or new.created_by <> old.created_by
     or new.data_classification <> old.data_classification or new.source_type <> old.source_type then
    raise exception 'only title, scenario and source notes of a case can be edited' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger clinical_cases_guard before update on clinical_cases
  for each row execute function app.guard_case_edit();
create trigger clinical_cases_no_delete before delete on clinical_cases
  for each row execute function app.forbid_mutation();

-- Projects: the pinned taxonomy/rubric version cannot change once anyone has started annotating,
-- otherwise one dataset would silently mix label definitions.
create or replace function app.guard_project_versions() returns trigger language plpgsql as $$
begin
  if (new.taxonomy_version_id <> old.taxonomy_version_id or new.rubric_version_id <> old.rubric_version_id)
     and exists (select 1 from annotations a where a.project_id = old.id) then
    raise exception 'taxonomy/rubric version is locked because annotations already exist in this project' using errcode = 'P0001';
  end if;
  if (new.owner_id <> old.owner_id or new.is_demo <> old.is_demo) and current_user = 'clinreview_app' then
    raise exception 'project owner and demo flag cannot be changed from the app' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger projects_guard_versions before update on projects
  for each row execute function app.guard_project_versions();
