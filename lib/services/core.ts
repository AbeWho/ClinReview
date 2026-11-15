import type { Tx } from "@/lib/db/types";
import { can, type Capability, type Role } from "@/lib/permissions/roles";
import { RubricDefinitionSchema, TaxonomyDefinitionSchema } from "@/lib/taxonomy/schema";

export interface Actor {
  id: string;
  displayName: string;
}

export type AppErrorCode = "not_found" | "forbidden" | "invalid" | "conflict" | "invalid_state" | "rate_limited";

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Translate raw Postgres errors (RLS, triggers, constraints) into user-meaningful errors. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const e = error as { code?: string; message?: string };
  const msg = e?.message ?? "Unexpected error";
  if (/row-level security|permission denied/i.test(msg)) return new AppError("forbidden", "You do not have permission to do that.");
  if (e?.code === "P0001") return new AppError("invalid_state", msg);
  if (e?.code === "23505") return new AppError("conflict", "This record already exists or was just changed by someone else.");
  if (e?.code === "23503" || e?.code === "23514") return new AppError("invalid", "The data violates a database integrity rule.");
  return new AppError("invalid_state", msg);
}

export async function one<T>(rows: Promise<T[]> | T[], what = "Record"): Promise<T> {
  const r = await rows;
  if (!r[0]) throw new AppError("not_found", `${what} not found or you do not have access.`);
  return r[0];
}

export async function getProjectRoles(tx: Tx, projectId: string, userId: string): Promise<Role[]> {
  const rows = await tx.query<{ role: Role }>("select role from project_members where project_id = $1 and user_id = $2", [projectId, userId]);
  return rows.map((r) => r.role);
}

export async function requireCapability(tx: Tx, projectId: string, actor: Actor, capability: Capability): Promise<Role[]> {
  const roles = await getProjectRoles(tx, projectId, actor.id);
  if (!roles.length) throw new AppError("not_found", "Project not found or you do not have access.");
  if (!can(roles, capability)) throw new AppError("forbidden", `Your role (${roles.join(", ")}) cannot perform this action.`);
  return roles;
}

export async function requireActiveProject(tx: Tx, projectId: string) {
  const p = await one(tx.query<{ status: string }>("select status from projects where id = $1", [projectId]), "Project");
  if (p.status !== "active") throw new AppError("invalid_state", "This project is archived and read-only.");
}

export interface AuditInput {
  projectId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
}

/** Append an audit event in the same transaction as the change it describes. */
export async function audit(tx: Tx, actor: Actor, e: AuditInput) {
  await tx.query(
    `insert into audit_events (project_id, actor_id, entity_type, entity_id, action, before_summary, after_summary)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [e.projectId, actor.id, e.entityType, e.entityId, e.action, e.before === undefined ? null : JSON.stringify(e.before), e.after === undefined ? null : JSON.stringify(e.after)],
  );
}

export async function loadDefinitions(tx: Tx, taxonomyVersionId: string, rubricVersionId: string) {
  const t = await one(tx.query<{ definitions_json: unknown; version: string }>("select definitions_json, version from taxonomy_versions where id = $1", [taxonomyVersionId]), "Taxonomy version");
  const r = await one(tx.query<{ definitions_json: unknown; version: string }>("select definitions_json, version from rubric_versions where id = $1", [rubricVersionId]), "Rubric version");
  return {
    taxonomy: TaxonomyDefinitionSchema.parse(t.definitions_json),
    taxonomyVersion: t.version,
    rubric: RubricDefinitionSchema.parse(r.definitions_json),
    rubricVersion: r.version,
  };
}

export function parseOrThrow<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: import("zod").ZodError } }, value: unknown, message = "Please fix the highlighted fields."): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of result.error.issues) (fieldErrors[i.path.join(".") || "_form"] ??= []).push(i.message);
    throw new AppError("invalid", message, fieldErrors);
  }
  return result.data;
}
