import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commitCaseImport, createCase, getCase, previewCaseImport, updateCase } from "@/lib/services/cases";
import { AppError } from "@/lib/services/core";
import { updateProject } from "@/lib/services/projects";
import { savePromptVersion } from "@/lib/services/prompts";
import { setupEnv, type TestEnv } from "./helpers";

let env: TestEnv;
let altTaxonomyId: string;
beforeAll(async () => {
  env = await setupEnv();
  const [row] = await env.db.withSystem((tx) => tx.query<{ id: string }>(
    "insert into taxonomy_versions (name, version, definitions_json, published_at) select name, '1.1.0', definitions_json, now() from taxonomy_versions limit 1 returning id"));
  altTaxonomyId = row!.id;
});
afterAll(async () => { await env.db.close(); });

const fails = async (p: Promise<unknown>, code?: AppError["code"] | RegExp) => {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err, "expected failure").toBeTruthy();
  if (code instanceof RegExp) expect(String((err as Error).message)).toMatch(code);
  else if (code) expect((err as AppError).code).toBe(code);
};

const scenario = (hpi: string) => ({ age_band: "40-49", sex: "female", chief_complaint: "Fatigue", hpi, vitals: {}, comorbidities: [], medications: [], allergies: [], labs: [] });
const projectInput = (overrides: Record<string, unknown> = {}) => ({
  name: "Edited Demo Project", clinical_domain: "Cardiology", description: "", dataset_purpose: "Evaluate reasoning in demo answers.",
  default_required_annotations: 2, blind_annotation: true, ...overrides,
});

describe("project editing", () => {
  it("owners can edit configuration and the change is audited", async () => {
    const p = await env.db.withSystem((tx) => tx.query<{ taxonomy_version_id: string; rubric_version_id: string }>("select taxonomy_version_id, rubric_version_id from projects where id = $1", [env.projectId]));
    await env.as("lead", (tx, a) => updateProject(tx, a, env.projectId, projectInput(p[0])));
    const [after] = await env.db.withSystem((tx) => tx.query<{ name: string }>("select name from projects where id = $1", [env.projectId]));
    expect(after!.name).toBe("Edited Demo Project");
    const audits = await env.db.withSystem((tx) => tx.query("select 1 from audit_events where action = 'project.updated'"));
    expect(audits.length).toBe(1);
  });
  it("taxonomy version is locked once annotations exist (service and database)", async () => {
    const [p] = await env.db.withSystem((tx) => tx.query<{ rubric_version_id: string }>("select rubric_version_id from projects where id = $1", [env.projectId]));
    await fails(env.as("lead", (tx, a) => updateProject(tx, a, env.projectId, projectInput({ taxonomy_version_id: altTaxonomyId, rubric_version_id: p!.rubric_version_id }))), "invalid_state");
    await fails(env.as("lead", (tx) => tx.query("update projects set taxonomy_version_id = $2 where id = $1", [env.projectId, altTaxonomyId])), /locked because annotations/);
  });
  it("non-managers cannot edit, and the app cannot flip the demo flag", async () => {
    await fails(env.as("annotatorA", (tx, a) => updateProject(tx, a, env.projectId, projectInput())), "forbidden");
    await fails(env.as("lead", (tx) => tx.query("update projects set is_demo = false where id = $1", [env.projectId])), /cannot be changed/);
  });
});

describe("case editing", () => {
  it("edits a case before any prompt exists, re-screening for identifiers and duplicates", async () => {
    const id = await env.as("lead", (tx, a) => createCase(tx, a, { project_id: env.projectId, title: "Editable case", scenario: scenario("Tired for a month."), source_type: "authored_synthetic", source_notes: "Synthetic test vignette.", synthetic_attestation: true }));
    await env.as("lead", (tx, a) => updateCase(tx, a, id, { title: "Edited case", scenario: scenario("Tired for two months."), source_notes: "Synthetic test vignette.", synthetic_attestation: true }));
    expect((await env.as("lead", (tx) => getCase(tx, id))).title).toBe("Edited case");
    await fails(env.as("lead", (tx, a) => updateCase(tx, a, id, { title: "Bad", scenario: scenario("Seen today, MRN: 55667788."), source_notes: "Synthetic test vignette.", synthetic_attestation: true })), "invalid");
    await fails(env.as("viewer", (tx, a) => updateCase(tx, a, id, { title: "Viewer edit", scenario: scenario("x is long enough"), source_notes: "Synthetic test vignette.", synthetic_attestation: true })), "forbidden");
  });
  it("freezes a case once a prompt is built from it (service and database)", async () => {
    const id = await env.as("lead", (tx, a) => createCase(tx, a, { project_id: env.projectId, title: "Soon frozen", scenario: scenario("Tired for three months."), source_type: "authored_synthetic", source_notes: "Synthetic test vignette.", synthetic_attestation: true }));
    await env.as("lead", (tx, a) => savePromptVersion(tx, a, { case_id: id, prompt_text: "What is the differential for this fatigue presentation?", template_key: null, tags: [], based_on_version: 0 }));
    await fails(env.as("lead", (tx, a) => updateCase(tx, a, id, { title: "Changed", scenario: scenario("Tired for four months."), source_notes: "Synthetic test vignette.", synthetic_attestation: true })), "invalid_state");
    await fails(env.as("lead", (tx) => tx.query("update clinical_cases set title = 'sneaky' where id = $1", [id])), /frozen/);
    await fails(env.db.withSystem((tx) => tx.query("delete from clinical_cases where id = $1", [id])), /immutable/);
  });
});

describe("bulk import", () => {
  const header = "title,age_band,sex,chief_complaint,hpi,source_notes,case_group_key";
  const line = (t: string, hpi: string, group = "") => `"${t}",30-39,male,"Back pain","${hpi}","Fictional import row.",${group}`;
  const file = (...rows: string[]) => ({ project_id: env.projectId, file_name: "import.csv", mime_type: "text/csv", content: [header, ...rows].join("\n") });

  it("dry run reports valid, error and duplicate rows and writes nothing", async () => {
    const f = file(line("Case A", "Low back pain after lifting.", "g1"), line("Case B", "Low back pain after lifting.", "g1"), line("Case C", "x"), line("Case D", "Back pain at night with weight loss.", "g1"));
    const before = await env.db.withSystem((tx) => tx.query("select id from clinical_cases"));
    const { rows } = await env.as("lead", (tx, a) => previewCaseImport(tx, a, f));
    expect(rows.map((r) => r.status)).toEqual(["valid", "duplicate", "error", "valid"]);
    expect(rows[1]!.messages[0]).toMatch(/row 1/);
    expect((await env.db.withSystem((tx) => tx.query("select id from clinical_cases"))).length).toBe(before.length);
  });
  it("imports only valid rows in one transaction; rows sharing a group key share a case group", async () => {
    const f = file(line("Imp 1", "Low back pain after lifting.", "g1"), line("Imp bad", "x"), line("Imp 2", "Back pain at night with weight loss.", "g1"));
    await fails(env.as("lead", (tx, a) => commitCaseImport(tx, a, f, false)), "invalid");
    const r = await env.as("lead", (tx, a) => commitCaseImport(tx, a, f, true));
    expect(r).toMatchObject({ imported: 2, skipped: 1 });
    const cases = await env.db.withSystem((tx) => tx.query<{ case_group_id: string; source_type: string }>("select case_group_id, source_type from clinical_cases where id = any($1::uuid[])", [r.caseIds]));
    expect(new Set(cases.map((c) => c.case_group_id)).size).toBe(1);
    expect(cases.every((c) => c.source_type === "imported_synthetic")).toBe(true);
    // Re-importing the same file now finds duplicates of existing cases.
    const again = await env.as("lead", (tx, a) => previewCaseImport(tx, a, f));
    expect(again.rows.filter((x) => x.status === "duplicate").length).toBe(2);
  });
  it("only owners/admins can import", async () => {
    await fails(env.as("reviewer", (tx, a) => previewCaseImport(tx, a, file(line("Case R", "Low back pain for a week.")))), "forbidden");
  });
});
