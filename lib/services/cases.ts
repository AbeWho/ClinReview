import { randomUUID } from "node:crypto";
import type { Tx } from "@/lib/db/types";
import { ImportRequestSchema, parseImport, type ParsedRow } from "@/lib/imports/case-import";
import { CaseInputSchema, detectLikelyIdentifiers, ScenarioSchema, type Scenario } from "@/lib/validation/case";
import { scenarioHash } from "@/lib/validation/hash";
import { AppError, audit, one, parseOrThrow, requireActiveProject, requireCapability, type Actor } from "./core";

export interface CaseRow {
  id: string;
  project_id: string;
  project_name: string;
  case_group_id: string;
  title: string;
  data_classification: string;
  scenario_json: Scenario;
  source_type: string;
  source_notes: string;
  content_hash: string;
  is_demo: boolean;
  created_by_name: string;
  created_at: Date;
  prompt_count: number;
  response_count: number;
}

const CASE_SELECT = `
  select c.*, p.name as project_name, u.display_name as created_by_name,
    (select count(*)::int from prompts pr where pr.case_id = c.id) as prompt_count,
    (select count(*)::int from model_responses r join prompt_versions v on v.id = r.prompt_version_id
       join prompts pr on pr.id = v.prompt_id where pr.case_id = c.id) as response_count
  from clinical_cases c join projects p on p.id = c.project_id join profiles u on u.id = c.created_by`;

export async function listCases(tx: Tx, projectId?: string): Promise<CaseRow[]> {
  return projectId
    ? tx.query<CaseRow>(`${CASE_SELECT} where c.project_id = $1 order by c.created_at desc`, [projectId])
    : tx.query<CaseRow>(`${CASE_SELECT} order by c.created_at desc limit 200`);
}

export async function getCase(tx: Tx, caseId: string): Promise<CaseRow> {
  const row = await one(tx.query<CaseRow>(`${CASE_SELECT} where c.id = $1`, [caseId]), "Case");
  return { ...row, scenario_json: ScenarioSchema.parse(row.scenario_json) };
}

/** Shared checks for any new/edited case: synthetic-only identifier screen + per-project duplicate hash. */
async function screenCase(tx: Tx, projectId: string, title: string, scenario: Scenario, notes: string, excludeCaseId?: string) {
  const identifiers = detectLikelyIdentifiers({ title, scenario, notes });
  if (identifiers.length) {
    throw new AppError(
      "invalid",
      `This looks like it may contain real identifiers (${identifiers.join(", ")}). ClinReview accepts fully synthetic cases only. Remove them and use age bands instead of dates.`,
    );
  }
  const hash = scenarioHash(scenario);
  const dup = await tx.query<{ id: string; title: string }>(
    "select id, title from clinical_cases where project_id = $1 and content_hash = $2 and id is distinct from $3", [projectId, hash, excludeCaseId ?? null]);
  if (dup[0]) throw new AppError("conflict", `An identical case already exists in this project: "${dup[0].title}".`);
  return hash;
}

export async function createCase(tx: Tx, actor: Actor, input: unknown, opts: { isDemo?: boolean } = {}) {
  const data = parseOrThrow(CaseInputSchema, input);
  await requireCapability(tx, data.project_id, actor, "author_content");
  await requireActiveProject(tx, data.project_id);
  const hash = await screenCase(tx, data.project_id, data.title, data.scenario, data.source_notes);

  const id = randomUUID();
  await tx.query(
    `insert into clinical_cases (id, project_id, case_group_id, title, data_classification, scenario_json, source_type, source_notes, content_hash, is_demo, created_by)
     values ($1,$2,$3,$4,'synthetic',$5,$6,$7,$8,$9,$10)`,
    [id, data.project_id, data.case_group_id ?? id, data.title, JSON.stringify(data.scenario), data.source_type, data.source_notes, hash, opts.isDemo ?? false, actor.id],
  );
  await audit(tx, actor, { projectId: data.project_id, entityType: "clinical_case", entityId: id, action: "case.created", after: { title: data.title, content_hash: hash.slice(0, 12) } });
  return id;
}

/** Edit a case. Allowed only until a prompt is built from it (also enforced by a DB trigger). */
export async function updateCase(tx: Tx, actor: Actor, caseId: string, input: unknown) {
  const existing = await getCase(tx, caseId);
  const data = parseOrThrow(CaseInputSchema, { ...(input as object), project_id: existing.project_id, source_type: existing.source_type });
  await requireCapability(tx, existing.project_id, actor, "author_content");
  await requireActiveProject(tx, existing.project_id);
  if (existing.prompt_count > 0) throw new AppError("invalid_state", "This case already has a prompt, so it is frozen. Create a new case instead.");
  const hash = await screenCase(tx, existing.project_id, data.title, data.scenario, data.source_notes, caseId);
  await tx.query(
    "update clinical_cases set title = $2, scenario_json = $3, source_notes = $4, content_hash = $5, updated_at = now() where id = $1",
    [caseId, data.title, JSON.stringify(data.scenario), data.source_notes, hash],
  );
  await audit(tx, actor, {
    projectId: existing.project_id, entityType: "clinical_case", entityId: caseId, action: "case.updated",
    before: { title: existing.title, content_hash: existing.content_hash.slice(0, 12) }, after: { title: data.title, content_hash: hash.slice(0, 12) },
  });
}

export interface ImportPreviewRow { row: number; title: string; status: "valid" | "error" | "duplicate"; messages: string[]; caseGroupKey: string | null }

/**
 * Dry run: validate every row (schema, identifiers, duplicates within the file and against the
 * project) without writing anything.
 */
export async function previewCaseImport(tx: Tx, actor: Actor, request: unknown) {
  const req = parseOrThrow(ImportRequestSchema, request);
  await requireCapability(tx, req.project_id, actor, "author_content");
  await requireActiveProject(tx, req.project_id);
  let rows: ParsedRow[];
  try {
    rows = parseImport({ fileName: req.file_name, mimeType: req.mime_type, content: req.content });
  } catch (e) {
    throw new AppError("invalid", (e as Error).message);
  }
  const existing = new Map((await tx.query<{ content_hash: string; title: string }>(
    "select content_hash, title from clinical_cases where project_id = $1", [req.project_id])).map((r) => [r.content_hash, r.title]));
  const seen = new Map<string, number>();
  const preview: ImportPreviewRow[] = rows.map((r) => {
    if (!r.input || r.errors.length) return { row: r.row, title: r.title, status: "error", messages: r.errors, caseGroupKey: r.caseGroupKey };
    const hash = scenarioHash(r.input.scenario);
    if (existing.has(hash)) return { row: r.row, title: r.title, status: "duplicate", messages: [`Identical to existing case "${existing.get(hash)}".`], caseGroupKey: r.caseGroupKey };
    if (seen.has(hash)) return { row: r.row, title: r.title, status: "duplicate", messages: [`Identical to row ${seen.get(hash)} in this file.`], caseGroupKey: r.caseGroupKey };
    seen.set(hash, r.row);
    return { row: r.row, title: r.title, status: "valid", messages: [], caseGroupKey: r.caseGroupKey };
  });
  return { rows: preview, parsed: rows, valid: preview.filter((p) => p.status === "valid").length };
}

/**
 * Import the rows that pass the dry run, in ONE transaction. Rows with errors or duplicates are
 * skipped and reported. Rows sharing a case_group_key share a case group (same dataset split).
 */
export async function commitCaseImport(tx: Tx, actor: Actor, request: unknown, attested: boolean) {
  if (!attested) throw new AppError("invalid", "Confirm that every case in the file is fully synthetic.");
  const { rows, parsed } = await previewCaseImport(tx, actor, request);
  const projectId = (request as { project_id: string }).project_id;
  const valid = rows.filter((r) => r.status === "valid");
  if (!valid.length) throw new AppError("invalid", "No valid rows to import. Fix the errors shown in the preview.");
  const groups = new Map<string, string>();
  const created: string[] = [];
  for (const v of valid) {
    const p = parsed.find((x) => x.row === v.row)!;
    let groupId: string | undefined;
    if (p.caseGroupKey) {
      groupId = groups.get(p.caseGroupKey);
    }
    const id = await createCase(tx, actor, {
      project_id: projectId, title: p.input!.title, scenario: p.input!.scenario, source_notes: p.input!.source_notes,
      source_type: "imported_synthetic", synthetic_attestation: true, case_group_id: groupId,
    });
    if (p.caseGroupKey && !groupId) groups.set(p.caseGroupKey, id);
    created.push(id);
  }
  await audit(tx, actor, {
    projectId, entityType: "case_import", entityId: null, action: "cases.imported",
    after: { file: (request as { file_name: string }).file_name, imported: created.length, skipped: rows.length - created.length },
  });
  return { imported: created.length, skipped: rows.length - created.length, caseIds: created };
}
