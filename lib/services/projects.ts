import type { Tx } from "@/lib/db/types";
import { ROLES, type Role } from "@/lib/permissions/roles";
import { ProjectInputSchema } from "@/lib/validation/forms";
import { AppError, audit, getProjectRoles, one, parseOrThrow, requireCapability, type Actor } from "./core";

export interface ProjectSummary {
  id: string;
  name: string;
  clinical_domain: string;
  description: string;
  dataset_purpose: string;
  status: "active" | "archived";
  is_demo: boolean;
  default_required_annotations: number;
  blind_annotation: boolean;
  taxonomy_version_id: string;
  rubric_version_id: string;
  taxonomy_label: string;
  rubric_label: string;
  owner_name: string;
  created_at: Date;
  case_count: number;
  task_count: number;
  finalized_count: number;
}

const PROJECT_SELECT = `
  select p.*, o.display_name as owner_name,
    tv.name || ' v' || tv.version as taxonomy_label,
    rv.name || ' v' || rv.version as rubric_label,
    (select count(*)::int from clinical_cases c where c.project_id = p.id) as case_count,
    (select count(*)::int from tasks t where t.project_id = p.id) as task_count,
    (select count(*)::int from tasks t where t.project_id = p.id and t.status = 'finalized') as finalized_count
  from projects p
  join profiles o on o.id = p.owner_id
  join taxonomy_versions tv on tv.id = p.taxonomy_version_id
  join rubric_versions rv on rv.id = p.rubric_version_id`;

/** RLS limits this to projects the actor belongs to. */
export async function listProjects(tx: Tx, opts: { includeArchived?: boolean } = {}): Promise<ProjectSummary[]> {
  return tx.query<ProjectSummary>(
    `${PROJECT_SELECT} ${opts.includeArchived ? "" : "where p.status = 'active'"} order by p.is_demo desc, p.created_at desc`,
  );
}

export async function getProject(tx: Tx, actor: Actor, projectId: string) {
  const project = await one(tx.query<ProjectSummary>(`${PROJECT_SELECT} where p.id = $1`, [projectId]), "Project");
  const roles = await getProjectRoles(tx, projectId, actor.id);
  return { project, roles };
}

export async function listDefinitionVersions(tx: Tx) {
  const taxonomies = await tx.query<{ id: string; name: string; version: string; project_id: string | null }>(
    "select id, name, version, project_id from taxonomy_versions where published_at is not null order by name, version",
  );
  const rubrics = await tx.query<{ id: string; name: string; version: string; project_id: string | null }>(
    "select id, name, version, project_id from rubric_versions where published_at is not null order by name, version",
  );
  return { taxonomies, rubrics };
}

export async function createProject(tx: Tx, actor: Actor, input: unknown) {
  const data = parseOrThrow(ProjectInputSchema, input);
  const [row] = await tx.query<{ id: string }>(
    `insert into projects (owner_id, name, clinical_domain, description, dataset_purpose, taxonomy_version_id,
       rubric_version_id, default_required_annotations, blind_annotation)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [actor.id, data.name, data.clinical_domain, data.description, data.dataset_purpose, data.taxonomy_version_id, data.rubric_version_id, data.default_required_annotations, data.blind_annotation],
  );
  const id = row!.id;
  await tx.query("insert into project_members (project_id, user_id, role) values ($1, $2, 'owner')", [id, actor.id]);
  await audit(tx, actor, { projectId: id, entityType: "project", entityId: id, action: "project.created", after: { name: data.name, domain: data.clinical_domain } });
  return id;
}

export async function setProjectArchived(tx: Tx, actor: Actor, projectId: string, archived: boolean) {
  await requireCapability(tx, projectId, actor, "manage_project");
  const status = archived ? "archived" : "active";
  await tx.query("update projects set status = $2, updated_at = now() where id = $1", [projectId, status]);
  await audit(tx, actor, { projectId, entityType: "project", entityId: projectId, action: archived ? "project.archived" : "project.restored" });
}

export interface MemberRow {
  user_id: string;
  display_name: string;
  email: string;
  is_demo_persona: boolean;
  credential_verified: boolean;
  training_disclosure: string | null;
  role: Role;
}

export async function listMembers(tx: Tx, projectId: string): Promise<MemberRow[]> {
  return tx.query<MemberRow>(
    `select m.user_id, m.role, p.display_name, p.email, p.is_demo_persona, p.credential_verified, p.training_disclosure
     from project_members m join profiles p on p.id = m.user_id
     where m.project_id = $1 order by array_position(array['owner','admin','annotator','reviewer','adjudicator','viewer'], m.role), p.display_name`,
    [projectId],
  );
}

export async function listProfiles(tx: Tx) {
  return tx.query<{ id: string; display_name: string; is_demo_persona: boolean }>(
    "select id, display_name, is_demo_persona from profiles order by display_name",
  );
}

export async function addMember(tx: Tx, actor: Actor, projectId: string, userId: string, role: string) {
  await requireCapability(tx, projectId, actor, "manage_project");
  if (!(ROLES as readonly string[]).includes(role) || role === "owner") throw new AppError("invalid", "Choose a valid role (ownership cannot be granted here).");
  await tx.query("insert into project_members (project_id, user_id, role) values ($1,$2,$3) on conflict do nothing", [projectId, userId, role]);
  await audit(tx, actor, { projectId, entityType: "project_member", entityId: userId, action: "member.added", after: { role } });
}

export async function removeMember(tx: Tx, actor: Actor, projectId: string, userId: string, role: string) {
  await requireCapability(tx, projectId, actor, "manage_project");
  if (role === "owner") throw new AppError("invalid", "The project owner role cannot be removed.");
  await tx.query("delete from project_members where project_id = $1 and user_id = $2 and role = $3", [projectId, userId, role]);
  await audit(tx, actor, { projectId, entityType: "project_member", entityId: userId, action: "member.removed", before: { role } });
}

/**
 * Edit project configuration. Taxonomy/rubric versions can only change before any annotation
 * exists (also enforced by a DB trigger), so a dataset never mixes label definitions.
 */
export async function updateProject(tx: Tx, actor: Actor, projectId: string, input: unknown) {
  await requireCapability(tx, projectId, actor, "manage_project");
  const data = parseOrThrow(ProjectInputSchema, input);
  const before = await one(tx.query<{ name: string; status: string; taxonomy_version_id: string; rubric_version_id: string; default_required_annotations: number; blind_annotation: boolean }>(
    "select name, status, taxonomy_version_id, rubric_version_id, default_required_annotations, blind_annotation from projects where id = $1", [projectId]), "Project");
  if (before.status !== "active") throw new AppError("invalid_state", "Restore the project before editing it.");
  const versionsChanged = before.taxonomy_version_id !== data.taxonomy_version_id || before.rubric_version_id !== data.rubric_version_id;
  if (versionsChanged) {
    const [{ n } = { n: 0 }] = await tx.query<{ n: number }>("select count(*)::int as n from annotations where project_id = $1", [projectId]);
    if (n > 0) throw new AppError("invalid_state", `The taxonomy/rubric version is locked because ${n} annotation(s) already use it.`, { taxonomy_version_id: ["Locked after annotation starts."] });
  }
  await tx.query(
    `update projects set name = $2, clinical_domain = $3, description = $4, dataset_purpose = $5, taxonomy_version_id = $6,
       rubric_version_id = $7, default_required_annotations = $8, blind_annotation = $9, updated_at = now() where id = $1`,
    [projectId, data.name, data.clinical_domain, data.description, data.dataset_purpose, data.taxonomy_version_id, data.rubric_version_id, data.default_required_annotations, data.blind_annotation],
  );
  await audit(tx, actor, {
    projectId, entityType: "project", entityId: projectId, action: "project.updated",
    before: { name: before.name, required: before.default_required_annotations, blind: before.blind_annotation, versions_changed: false },
    after: { name: data.name, required: data.default_required_annotations, blind: data.blind_annotation, versions_changed: versionsChanged },
  });
}

/** Whether the pinned definition versions can still be changed (no annotations yet). */
export async function versionsLocked(tx: Tx, projectId: string) {
  const [{ n } = { n: 0 }] = await tx.query<{ n: number }>("select count(*)::int as n from annotations where project_id = $1", [projectId]);
  return n > 0;
}
