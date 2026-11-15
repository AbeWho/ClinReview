-- ClinReview core schema.
-- Conventions: UUID primary keys, timestamptz everywhere, explicit CHECK constraints for
-- every status column, and composite foreign keys (id, project_id) so a child row can
-- never point at a parent that lives in a different project (tenant boundary in the DB).

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null check (length(display_name) between 2 and 80),
  is_demo_persona boolean not null default false,
  -- Free-text self-description (e.g. "Nursing student"). Never displayed as a verified credential.
  training_disclosure text,
  credential_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Versioned taxonomy + rubric (project_id null = global template)
-- ---------------------------------------------------------------------------
create table taxonomy_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null,
  version text not null check (version ~ '^\d+\.\d+\.\d+$'),
  definitions_json jsonb not null,
  published_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique nulls not distinct (project_id, name, version)
);

create table rubric_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  name text not null,
  version text not null check (version ~ '^\d+\.\d+\.\d+$'),
  definitions_json jsonb not null,
  published_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique nulls not distinct (project_id, name, version)
);

-- ---------------------------------------------------------------------------
-- Projects + membership
-- ---------------------------------------------------------------------------
create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  name text not null check (length(name) between 3 and 120),
  clinical_domain text not null check (length(clinical_domain) between 2 and 80),
  description text not null default '',
  dataset_purpose text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  taxonomy_version_id uuid not null references taxonomy_versions(id),
  rubric_version_id uuid not null references rubric_versions(id),
  default_required_annotations int not null default 1 check (default_required_annotations between 1 and 2),
  blind_annotation boolean not null default true,
  allow_deidentified boolean not null default false check (allow_deidentified = false), -- V1: synthetic only
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table taxonomy_versions add constraint taxonomy_versions_project_fk foreign key (project_id) references projects(id);
alter table rubric_versions add constraint rubric_versions_project_fk foreign key (project_id) references projects(id);

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id),
  role text not null check (role in ('owner', 'admin', 'annotator', 'reviewer', 'adjudicator', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id, role)
);
create index project_members_user_idx on project_members(user_id);

-- ---------------------------------------------------------------------------
-- Cases, prompts, responses
-- ---------------------------------------------------------------------------
create table clinical_cases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  -- Variants of the same scenario share a group so dataset splits never leak across train/test.
  case_group_id uuid not null,
  title text not null check (length(title) between 3 and 160),
  data_classification text not null default 'synthetic'
    check (data_classification in ('synthetic', 'deidentified_authorized')),
  scenario_json jsonb not null,
  source_type text not null check (source_type in ('authored_synthetic', 'template_synthetic', 'imported_synthetic')),
  source_notes text not null default '',
  content_hash text not null,
  is_demo boolean not null default false,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  unique (project_id, content_hash)
);

create table prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  case_id uuid not null,
  title text not null check (length(title) between 3 and 160),
  tags text[] not null default '{}',
  current_version_id uuid,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (case_id, project_id) references clinical_cases(id, project_id)
);
create index prompts_case_idx on prompts(case_id);

create table prompt_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  prompt_id uuid not null,
  version_number int not null check (version_number >= 1),
  prompt_text text not null check (length(prompt_text) between 20 and 8000),
  template_key text,
  template_metadata jsonb not null default '{}',
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (id, project_id),
  unique (prompt_id, version_number),
  foreign key (prompt_id, project_id) references prompts(id, project_id)
);
alter table prompts add constraint prompts_current_version_fk
  foreign key (current_version_id) references prompt_versions(id);

create table model_responses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  prompt_version_id uuid not null,
  provider text not null check (length(provider) between 1 and 80),
  model_name text not null check (length(model_name) between 1 and 120),
  model_version text not null default 'unspecified',
  generation_settings jsonb not null default '{}',
  response_text text not null check (length(response_text) between 1 and 20000),
  origin text not null check (origin in ('manual', 'provider', 'seed')),
  generated_at timestamptz,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (prompt_version_id, project_id) references prompt_versions(id, project_id)
);
create index model_responses_prompt_version_idx on model_responses(prompt_version_id);

-- ---------------------------------------------------------------------------
-- Work items
-- ---------------------------------------------------------------------------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  response_id uuid not null,
  task_type text not null default 'evaluate_response' check (task_type in ('evaluate_response')),
  status text not null default 'queued'
    check (status in ('queued', 'in_progress', 'in_review', 'changes_requested', 'adjudication', 'finalized')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  required_annotations int not null default 1 check (required_annotations between 1 and 2),
  due_at timestamptz,
  finalized_via text check (finalized_via in ('review', 'consensus', 'adjudication')),
  final_annotation_id uuid,
  finalized_at timestamptz,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  unique (response_id, task_type),
  foreign key (response_id, project_id) references model_responses(id, project_id),
  check ((status = 'finalized') = (finalized_via is not null))
);
create index tasks_project_status_idx on tasks(project_id, status);

create table task_assignments (
  task_id uuid not null,
  project_id uuid not null,
  annotator_id uuid not null references profiles(id),
  assigned_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  primary key (task_id, annotator_id),
  foreign key (task_id, project_id) references tasks(id, project_id)
);
create index task_assignments_annotator_idx on task_assignments(annotator_id);

create table annotations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  annotator_id uuid not null references profiles(id),
  taxonomy_version_id uuid not null references taxonomy_versions(id),
  rubric_version_id uuid not null references rubric_versions(id),
  revision int not null default 1 check (revision >= 1),
  revises_annotation_id uuid references annotations(id),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'superseded')),
  labels_json jsonb not null default '{}',
  rationale text not null default '' check (length(rationale) <= 8000),
  confidence double precision check (confidence between 0 and 1),
  lock_version int not null default 1,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  unique (task_id, annotator_id, revision),
  foreign key (task_id, project_id) references tasks(id, project_id),
  check ((status = 'draft') = (submitted_at is null))
);
-- At most one open draft and one current submission per annotator per task.
create unique index annotations_one_draft_idx on annotations(task_id, annotator_id) where status = 'draft';
create unique index annotations_one_submitted_idx on annotations(task_id, annotator_id) where status = 'submitted';

alter table tasks add constraint tasks_final_annotation_fk
  foreign key (final_annotation_id) references annotations(id);

create table annotation_evidence (
  id uuid primary key default gen_random_uuid(),
  annotation_id uuid not null references annotations(id) on delete cascade,
  response_start_offset int not null check (response_start_offset >= 0),
  response_end_offset int not null,
  quote_snapshot text not null check (length(quote_snapshot) between 1 and 4000),
  issue_category text,
  notes text not null default '' check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  check (response_end_offset > response_start_offset)
);
create index annotation_evidence_annotation_idx on annotation_evidence(annotation_id);

create table clinical_reviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  annotation_id uuid not null unique, -- one decision per annotation revision
  reviewer_id uuid not null references profiles(id),
  decision text not null check (decision in ('approve', 'needs_changes', 'reject')),
  comments text not null default '' check (length(comments) <= 8000),
  checklist_json jsonb not null default '{}',
  status text not null default 'final' check (status in ('final')),
  created_at timestamptz not null default now(),
  foreign key (task_id, project_id) references tasks(id, project_id),
  foreign key (annotation_id, project_id) references annotations(id, project_id)
);

create table adjudications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique,
  project_id uuid not null,
  adjudicator_id uuid not null references profiles(id),
  compared_annotation_ids uuid[] not null check (cardinality(compared_annotation_ids) >= 2),
  final_labels_json jsonb not null,
  final_rationale text not null,
  final_confidence double precision check (final_confidence between 0 and 1),
  reason text not null check (length(reason) between 20 and 8000),
  status text not null default 'finalized' check (status in ('finalized')),
  created_at timestamptz not null default now(),
  foreign key (task_id, project_id) references tasks(id, project_id)
);

-- ---------------------------------------------------------------------------
-- Exports
-- ---------------------------------------------------------------------------
create table export_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  semantic_version text not null check (semantic_version ~ '^\d+\.\d+\.\d+$'),
  schema_version text not null,
  split_seed text not null,
  manifest_json jsonb not null,
  record_count int not null check (record_count >= 1),
  excluded_count int not null default 0,
  content_hash text not null,
  jsonl_content text not null,
  csv_content text not null,
  -- Artifacts are stored in the DB for V1; a storage bucket path can replace this later.
  artifact_path text,
  expires_at timestamptz,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (project_id, semantic_version)
);

-- One split per case group per export: enforced structurally by this table + composite FK.
create table export_group_splits (
  export_id uuid not null references export_versions(id),
  case_group_id uuid not null,
  split text not null check (split in ('train', 'validation', 'test')),
  primary key (export_id, case_group_id),
  unique (export_id, case_group_id, split)
);

create table export_records (
  export_id uuid not null references export_versions(id),
  task_id uuid not null references tasks(id),
  case_group_id uuid not null,
  split text not null,
  item_hash text not null,
  primary key (export_id, task_id),
  foreign key (export_id, case_group_id, split) references export_group_splits(export_id, case_group_id, split)
);

-- ---------------------------------------------------------------------------
-- Audit trail (append-only)
-- ---------------------------------------------------------------------------
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  actor_id uuid not null references profiles(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_summary jsonb,
  after_summary jsonb,
  -- clock_timestamp (not now()) so events inside one transaction keep their real order.
  created_at timestamptz not null default clock_timestamp()
);
create index audit_events_project_idx on audit_events(project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- Generic: block UPDATE/DELETE on append-only tables.
create or replace function app.forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% rows are immutable (attempted %)', tg_table_name, tg_op using errcode = 'P0001';
end $$;

create trigger prompt_versions_immutable before update or delete on prompt_versions
  for each row execute function app.forbid_mutation();
create trigger model_responses_immutable before update or delete on model_responses
  for each row execute function app.forbid_mutation();
create trigger clinical_reviews_immutable before update or delete on clinical_reviews
  for each row execute function app.forbid_mutation();
create trigger adjudications_immutable before update or delete on adjudications
  for each row execute function app.forbid_mutation();
create trigger export_versions_immutable before update or delete on export_versions
  for each row execute function app.forbid_mutation();
create trigger export_records_immutable before update or delete on export_records
  for each row execute function app.forbid_mutation();
create trigger export_group_splits_immutable before update or delete on export_group_splits
  for each row execute function app.forbid_mutation();
create trigger audit_events_immutable before update or delete on audit_events
  for each row execute function app.forbid_mutation();

-- Published taxonomy/rubric versions are frozen.
create or replace function app.freeze_published() returns trigger language plpgsql as $$
begin
  if old.published_at is not null then
    raise exception '% version % is published and immutable', tg_table_name, old.version using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger taxonomy_versions_frozen before update or delete on taxonomy_versions
  for each row execute function app.freeze_published();
create trigger rubric_versions_frozen before update or delete on rubric_versions
  for each row execute function app.freeze_published();

-- Submitted annotations are immutable. The only permitted change is submitted -> superseded
-- (when a linked revision replaces it); content columns must remain identical.
create or replace function app.guard_annotation() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'submitted annotations cannot be deleted' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'draft' then
    return new;
  end if;
  if old.status = 'submitted' and new.status = 'superseded'
     and new.labels_json = old.labels_json and new.rationale = old.rationale
     and new.confidence is not distinct from old.confidence
     and new.annotator_id = old.annotator_id and new.task_id = old.task_id
     and new.revision = old.revision and new.submitted_at = old.submitted_at then
    return new;
  end if;
  raise exception 'annotation % is % and immutable', old.id, old.status using errcode = 'P0001';
end $$;
create trigger annotations_guard before update or delete on annotations
  for each row execute function app.guard_annotation();

-- Evidence may only change while its annotation is a draft; offsets must match the response text.
create or replace function app.guard_evidence() returns trigger language plpgsql as $$
declare
  v_status text;
  v_text text;
  v_annotation uuid := coalesce(new.annotation_id, old.annotation_id);
begin
  select a.status, r.response_text into v_status, v_text
  from annotations a
  join tasks t on t.id = a.task_id
  join model_responses r on r.id = t.response_id
  where a.id = v_annotation;
  if v_status is distinct from 'draft' then
    raise exception 'evidence is locked once the annotation is submitted' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if new.response_end_offset > length(v_text)
       or substr(v_text, new.response_start_offset + 1, new.response_end_offset - new.response_start_offset) <> new.quote_snapshot then
      raise exception 'evidence quote does not match the response text at the given offsets' using errcode = 'P0001';
    end if;
    return new;
  end if;
  return old;
end $$;
create trigger annotation_evidence_guard before insert or update or delete on annotation_evidence
  for each row execute function app.guard_evidence();

-- Independence: a reviewer can never review their own annotation.
create or replace function app.guard_review_independence() returns trigger language plpgsql as $$
begin
  if exists (select 1 from annotations a where a.id = new.annotation_id and a.annotator_id = new.reviewer_id) then
    raise exception 'reviewers cannot review their own annotation' using errcode = 'P0001';
  end if;
  if not exists (select 1 from annotations a where a.id = new.annotation_id and a.status = 'submitted') then
    raise exception 'only submitted annotations can be reviewed' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger clinical_reviews_independence before insert on clinical_reviews
  for each row execute function app.guard_review_independence();

-- Adjudicators cannot be one of the annotators whose labels they are resolving.
create or replace function app.guard_adjudication_independence() returns trigger language plpgsql as $$
begin
  if exists (select 1 from annotations a where a.id = any(new.compared_annotation_ids) and a.annotator_id = new.adjudicator_id) then
    raise exception 'adjudicators cannot adjudicate their own annotations' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger adjudications_independence before insert on adjudications
  for each row execute function app.guard_adjudication_independence();
