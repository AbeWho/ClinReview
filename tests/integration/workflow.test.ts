import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExportRecordSchema } from "@/lib/exports/schema";
import { dashboardSummary } from "@/lib/services/activity";
import { getAnnotation, listTaskAnnotations, saveDraft, startOrResumeAnnotation, submitAnnotation } from "@/lib/services/annotations";
import { submitAdjudication } from "@/lib/services/adjudications";
import { createCase } from "@/lib/services/cases";
import { AppError } from "@/lib/services/core";
import { computeEligibility, createExport } from "@/lib/services/exports";
import { addMember, createProject } from "@/lib/services/projects";
import { getPromptForCase, savePromptVersion } from "@/lib/services/prompts";
import { projectReport } from "@/lib/services/reports";
import { attachResponse } from "@/lib/services/responses";
import { submitReview } from "@/lib/services/reviews";
import { getTaskContext, queueTask } from "@/lib/services/tasks";
import { completeLabels, setupEnv, type TestEnv } from "./helpers";

let env: TestEnv;
beforeAll(async () => { env = await setupEnv(); });
afterAll(async () => { await env.db.close(); });

const expectError = async (p: Promise<unknown>, code?: AppError["code"] | RegExp) => {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err, "expected the operation to fail").toBeTruthy();
  if (code instanceof RegExp) expect(String((err as Error).message)).toMatch(code);
  else if (code) expect((err as AppError).code).toBe(code);
};

const scenario = {
  age_band: "40-49", sex: "unspecified", chief_complaint: "Headache for one week", hpi: "Gradual-onset daily headache, no neuro deficits.",
  vitals: { bp: "128/80", hr: "70", rr: "14", spo2: "99%", temp_c: "36.8" }, comorbidities: [], medications: [], allergies: [], labs: [],
};

describe("seeded demo state", () => {
  it("reaches each lifecycle state through real transitions", async () => {
    const statuses = await env.db.withSystem((tx) => tx.query<{ status: string }>("select status from tasks order by status"));
    expect(statuses.map((s) => s.status).sort()).toEqual(["adjudication", "finalized", "finalized", "in_progress", "in_review"]);
  });
  it("dashboard KPIs match the underlying records", async () => {
    const lead = await env.as("lead", (tx, a) => dashboardSummary(tx, a));
    expect(lead).toMatchObject({ projects: 1, demo_projects: 1, total_tasks: 5, finalized: 2 });
    const a = await env.as("annotatorA", (tx, actor) => dashboardSummary(tx, actor));
    expect(a.my_open_tasks).toBe(1); // only the unlabeled chest-pain task
    const reviewer = await env.as("reviewer", (tx, actor) => dashboardSummary(tx, actor));
    expect(reviewer.reviews_due).toBe(1);
    const adj = await env.as("adjudicator", (tx, actor) => dashboardSummary(tx, actor));
    expect(adj.adjudications_due).toBe(1);
  });
  it("reports are calculated from records", async () => {
    const r = await env.as("lead", (tx, a) => projectReport(tx, a, env.projectId));
    expect(r.totalTasks).toBe(5);
    expect(r.finalizedCount).toBe(2);
    expect(r.verdicts).toEqual({ partially_correct: 1, incorrect: 1 });
    expect(r.verdictAgreement.n).toBe(2); // HF pair + warfarin pair
    expect(r.verdictAgreement.percentAgreement).toBe(0);
    // Viewers only see annotations of finalized tasks (RLS), so the unresolved warfarin pair is hidden from them.
    const v = await env.as("viewer", (tx, a) => projectReport(tx, a, env.projectId));
    expect(v.verdictAgreement.n).toBe(1);
  });
});

describe("prompt and response immutability", () => {
  it("editing a prompt creates a new version; existing responses keep pointing at the old one", async () => {
    const taskId = await env.taskByTitle("Chest pressure");
    const ctx = await env.as("lead", (tx) => getTaskContext(tx, taskId));
    const v2 = await env.as("lead", (tx, a) => savePromptVersion(tx, a, { case_id: ctx.caseRow.id, prompt_text: ctx.prompt.prompt_text + "\nAnswer in under 150 words.", template_key: null, tags: [], based_on_version: 1 }));
    expect(v2.version_number).toBe(2);
    const after = await env.as("lead", (tx) => getTaskContext(tx, taskId));
    expect(after.prompt.version_number).toBe(1);
    expect(after.prompt.prompt_text).toBe(ctx.prompt.prompt_text);
  });
  it("rejects a stale prompt save (optimistic concurrency)", async () => {
    const taskId = await env.taskByTitle("Chest pressure");
    const ctx = await env.as("lead", (tx) => getTaskContext(tx, taskId));
    await expectError(env.as("lead", (tx, a) => savePromptVersion(tx, a, { case_id: ctx.caseRow.id, prompt_text: "A different prompt text for the same case.", template_key: null, tags: [], based_on_version: 1 })), "conflict");
  });
  it("the database refuses to modify a prompt version or a model response", async () => {
    await expectError(env.as("lead", (tx) => tx.query("update prompt_versions set prompt_text = 'changed text that is long enough'")), /immutable|permission denied/);
    await expectError(env.db.withSystem((tx) => tx.query("update model_responses set response_text = 'x'")), /immutable/);
  });
});

describe("labeling", () => {
  it("saves a partial draft, resumes it, and refuses to submit while incomplete", async () => {
    const taskId = await env.taskByTitle("Chest pressure");
    const id = await env.as("annotatorA", (tx, a) => startOrResumeAnnotation(tx, a, taskId));
    expect(id).toBeTruthy();
    const draft = await env.as("annotatorA", (tx) => getAnnotation(tx, id!));
    const saved = await env.as("annotatorA", (tx, a) => saveDraft(tx, a, id!, draft.lock_version, { labels: { verdict: "incorrect" }, rationale: "partial" }));
    const resumed = await env.as("annotatorA", (tx, a) => startOrResumeAnnotation(tx, a, taskId));
    expect(resumed).toBe(id);
    expect((await env.as("annotatorA", (tx) => getAnnotation(tx, id!))).labels_json.verdict).toBe("incorrect");
    await expectError(env.as("annotatorA", (tx, a) => submitAnnotation(tx, a, id!, saved.lock_version)), "invalid");
  });
  it("detects a conflicting autosave from another tab", async () => {
    const taskId = await env.taskByTitle("Chest pressure");
    const id = (await env.as("annotatorA", (tx, a) => startOrResumeAnnotation(tx, a, taskId)))!;
    await expectError(env.as("annotatorA", (tx, a) => saveDraft(tx, a, id, 1, { labels: {} })), "conflict");
  });
  it("rejects evidence that does not match the response text", async () => {
    const taskId = await env.taskByTitle("Chest pressure");
    const id = (await env.as("annotatorA", (tx, a) => startOrResumeAnnotation(tx, a, taskId)))!;
    const a = await env.as("annotatorA", (tx) => getAnnotation(tx, id));
    await expectError(env.as("annotatorA", (tx, actor) => saveDraft(tx, actor, id, a.lock_version, { labels: {}, evidence: [{ start: 0, end: 5, quote: "WRONG" }] })), "invalid");
  });
  it("submits a complete annotation, then blocks duplicate submission and edits", async () => {
    const taskId = await env.taskByTitle("Chest pressure");
    const ctx = await env.as("annotatorA", (tx) => getTaskContext(tx, taskId));
    const id = (await env.as("annotatorA", (tx, a) => startOrResumeAnnotation(tx, a, taskId)))!;
    const a = await env.as("annotatorA", (tx) => getAnnotation(tx, id));
    const saved = await env.as("annotatorA", (tx, actor) => saveDraft(tx, actor, id, a.lock_version, completeLabels("This sounds most like acid reflux", ctx.response.response_text)));
    const state = await env.as("annotatorA", (tx, actor) => submitAnnotation(tx, actor, id, saved.lock_version));
    expect(state.status).toBe("in_review");
    await expectError(env.as("annotatorA", (tx, actor) => submitAnnotation(tx, actor, id, saved.lock_version + 1)), "invalid_state");
    await expectError(env.as("annotatorA", (tx) => tx.query("update annotations set rationale = 'tampered' where id = $1", [id])), /immutable/);
  });
  it("an unassigned annotator cannot open the task", async () => {
    const taskId = await env.taskByTitle("Chest pressure");
    await expectError(env.as("annotatorB", (tx, a) => startOrResumeAnnotation(tx, a, taskId)), "forbidden");
  });
});

describe("independent review", () => {
  it("an annotator cannot approve their own annotation, even if they also hold the reviewer role", async () => {
    await env.as("lead", (tx, a) => addMember(tx, a, env.projectId, env.actors.annotatorA.id, "reviewer"));
    const taskId = await env.taskByTitle("Neuropathic pain");
    const [own] = await env.as("annotatorA", (tx) => listTaskAnnotations(tx, taskId));
    await expectError(env.as("annotatorA", (tx, a) => submitReview(tx, a, { annotation_id: own!.id, decision: "approve", comments: "" })), "forbidden");
    // Defense in depth: the database trigger blocks it even if the service check were bypassed.
    await expectError(env.as("annotatorA", (tx) => tx.query(
      "insert into clinical_reviews (task_id, project_id, annotation_id, reviewer_id, decision) values ($1,$2,$3,$4,'approve')",
      [taskId, env.projectId, own!.id, env.actors.annotatorA.id])), /own annotation/);
  });
  it("needs_changes -> revision -> approve, preserving the original submission", async () => {
    const taskId = await env.taskByTitle("Neuropathic pain");
    const [orig] = await env.as("reviewer", (tx) => listTaskAnnotations(tx, taskId));
    await expectError(env.as("reviewer", (tx, a) => submitReview(tx, a, { annotation_id: orig!.id, decision: "needs_changes", comments: "short" })), "invalid");
    const s1 = await env.as("reviewer", (tx, a) => submitReview(tx, a, { annotation_id: orig!.id, decision: "needs_changes", comments: "Please add a monitoring consideration to the rationale." }));
    expect(s1.status).toBe("changes_requested");

    const revId = (await env.as("annotatorA", (tx, a) => startOrResumeAnnotation(tx, a, taskId)))!;
    expect(revId).not.toBe(orig!.id);
    const rev = await env.as("annotatorA", (tx) => getAnnotation(tx, revId));
    expect(rev.revision).toBe(2);
    expect(rev.evidence.length).toBe(orig!.evidence.length); // prefilled from the original
    const saved = await env.as("annotatorA", (tx, a) => saveDraft(tx, a, revId, rev.lock_version, {
      labels: rev.labels_json, rationale: rev.rationale + " Monitor for sedation and falls.", confidence: rev.confidence,
      evidence: rev.evidence.map((e) => ({ start: e.response_start_offset, end: e.response_end_offset, quote: e.quote_snapshot, issue_category: e.issue_category })),
    }));
    expect((await env.as("annotatorA", (tx, a) => submitAnnotation(tx, a, revId, saved.lock_version))).status).toBe("in_review");
    expect((await env.as("reviewer", (tx, a) => submitReview(tx, a, { annotation_id: revId, decision: "approve", comments: "" }))).status).toBe("finalized");

    const all = await env.as("lead", (tx) => listTaskAnnotations(tx, taskId));
    expect(all.map((x) => [x.revision, x.status])).toEqual([[1, "superseded"], [2, "submitted"]]);
    expect(all[0]!.rationale).toBe(orig!.rationale);
    expect(all[0]!.review?.decision).toBe("needs_changes");
  });
});

describe("blind annotation and tenant isolation", () => {
  it("annotator B cannot see annotator A's labels on a shared task", async () => {
    const taskId = await env.taskByTitle("HFrEF");
    const seenByB = await env.as("annotatorB", (tx) => listTaskAnnotations(tx, taskId));
    expect(seenByB.every((a) => a.annotator_id === env.actors.annotatorB.id)).toBe(true);
    expect(seenByB.length).toBe(1);
    const seenByLead = await env.as("lead", (tx) => listTaskAnnotations(tx, taskId));
    expect(seenByLead.length).toBe(2);
  });
  it("members of one project cannot read or write another project's data", async () => {
    const tax = await env.db.withSystem((tx) => tx.query<{ t: string; r: string }>("select (select id from taxonomy_versions limit 1) t, (select id from rubric_versions limit 1) r"));
    const otherProject = await env.as("viewer", (tx, a) => createProject(tx, a, {
      name: "Private Viewer Project", clinical_domain: "Renal", description: "", dataset_purpose: "Isolation test project",
      taxonomy_version_id: tax[0]!.t, rubric_version_id: tax[0]!.r, default_required_annotations: 1, blind_annotation: true,
    }));
    const caseId = await env.as("viewer", (tx, a) => createCase(tx, a, { project_id: otherProject, title: "Isolation case", scenario, source_type: "authored_synthetic", source_notes: "Synthetic test vignette.", synthetic_attestation: true }));
    // The demo lead (owner elsewhere) sees nothing here and cannot write into it.
    expect(await env.as("lead", (tx) => tx.query("select id from projects where id = $1", [otherProject]))).toEqual([]);
    expect(await env.as("lead", (tx) => tx.query("select id from clinical_cases where id = $1", [caseId]))).toEqual([]);
    await expectError(env.as("lead", (tx, a) => createCase(tx, a, { project_id: otherProject, title: "Injected", scenario: { ...scenario, hpi: "Different text here." }, source_type: "authored_synthetic", source_notes: "Synthetic test vignette.", synthetic_attestation: true })), "not_found");
    await expectError(env.as("lead", (tx) => tx.query("insert into project_members (project_id, user_id, role) values ($1,$2,'admin')", [otherProject, env.actors.lead.id])), /row-level security/);
  });
  it("viewers cannot author content in their own project", async () => {
    await expectError(env.as("viewer", (tx, a) => createCase(tx, a, { project_id: env.projectId, title: "Viewer case", scenario, source_type: "authored_synthetic", source_notes: "Synthetic test vignette.", synthetic_attestation: true })), "forbidden");
  });
  it("rejects cases containing obvious identifiers", async () => {
    await expectError(env.as("lead", (tx, a) => createCase(tx, a, { project_id: env.projectId, title: "Bad case", scenario: { ...scenario, hpi: "MRN: 99887766 seen today." }, source_type: "authored_synthetic", source_notes: "Synthetic test vignette.", synthetic_attestation: true })), "invalid");
  });
  it("audit events cannot be altered by app users", async () => {
    await expectError(env.as("lead", (tx) => tx.query("delete from audit_events")), /permission denied/);
    await expectError(env.as("lead", (tx) => tx.query("update audit_events set action = 'x'")), /permission denied/);
  });
});

describe("adjudication", () => {
  it("only adjudicators may adjudicate", async () => {
    const taskId = await env.taskByTitle("Warfarin");
    for (const who of ["viewer", "reviewer", "annotatorA", "lead"] as const) {
      await expectError(env.as(who, (tx, a) => submitAdjudication(tx, a, { task_id: taskId, reason: "x".repeat(30), final: {} })), "forbidden");
    }
  });
  it("finalizes the disagreement while preserving both independent annotations", async () => {
    const taskId = await env.taskByTitle("Warfarin");
    const before = await env.as("adjudicator", (tx) => listTaskAnnotations(tx, taskId));
    expect(new Set(before.map((a) => a.labels_json.verdict))).toEqual(new Set(["incorrect", "partially_correct"]));
    await expectError(env.as("adjudicator", (tx, a) => submitAdjudication(tx, a, { task_id: taskId, reason: "too short", final: {} })), "invalid");
    const state = await env.as("adjudicator", (tx, a) => submitAdjudication(tx, a, {
      task_id: taskId,
      reason: "The missed interaction is the core requested task; final verdict incorrect with high severity.",
      final: { labels: { ...before[0]!.labels_json, verdict: "incorrect", safety_severity: "high" }, rationale: "Missed warfarin interaction.", confidence: 0.8 },
    }));
    expect(state).toMatchObject({ status: "finalized", finalizedVia: "adjudication" });
    const after = await env.as("adjudicator", (tx) => listTaskAnnotations(tx, taskId));
    expect(after.map((a) => [a.id, a.status, a.labels_json.verdict, a.rationale])).toEqual(before.map((a) => [a.id, a.status, a.labels_json.verdict, a.rationale]));
  });
});

describe("exports", () => {
  it("excludes unfinished work with reasons, and only owners/admins can export", async () => {
    const e = await env.as("lead", (tx, a) => computeEligibility(tx, a, env.projectId));
    expect(e.eligibleCount).toBe(4); // HF, DKA, neuropathic (revised+approved), warfarin (adjudicated)
    expect(e.items.find((i) => i.case_title.startsWith("Chest"))?.reason).toMatch(/review/i);
    await expectError(env.as("viewer", (tx, a) => createExport(tx, a, { project_id: env.projectId, split_seed: "s1" })), "forbidden");
  });
  it("writes valid, independently parseable JSONL with deterministic, non-leaking splits", async () => {
    const r1 = await env.as("lead", (tx, a) => createExport(tx, a, { project_id: env.projectId, split_seed: "seed-1" }));
    const r2 = await env.as("lead", (tx, a) => createExport(tx, a, { project_id: env.projectId, split_seed: "seed-1" }));
    expect(r1.version).toBe("1.0.0");
    expect(r2.version).toBe("1.1.0");
    expect(r2.contentHash).toBe(r1.contentHash); // reproducible from the same data + seed

    const [row] = await env.as("viewer", (tx) => tx.query<{ jsonl_content: string; csv_content: string; manifest_json: { record_count: number; excluded_count: number } }>("select jsonl_content, csv_content, manifest_json from export_versions where id = $1", [r1.id]));
    const lines = row!.jsonl_content.trim().split("\n");
    expect(lines.length).toBe(4);
    expect(row!.manifest_json).toMatchObject({ record_count: 4, excluded_count: 1 });
    const records = lines.map((l) => ExportRecordSchema.parse(JSON.parse(l)));
    expect(records.every((r) => r.case_classification === "synthetic")).toBe(true);
    const adj = records.find((r) => r.evaluation.finalized_via === "adjudication" && r.provenance.source_annotations.length === 2);
    expect(adj?.provenance.adjudication_id).toBeTruthy();
    expect(JSON.stringify(records)).not.toMatch(/clinreview\.invalid/); // no annotator emails leak
    expect(row!.csv_content.split("\r\n")[0]).toContain('"record_id"');

    const leaks = await env.db.withSystem((tx) => tx.query("select case_group_id from export_records where export_id = $1 group by case_group_id having count(distinct split) > 1", [r1.id]));
    expect(leaks).toEqual([]);
  });
  it("export versions are immutable", async () => {
    await expectError(env.db.withSystem((tx) => tx.query("update export_versions set record_count = 99")), /immutable/);
  });
});

describe("authoring path: new case to queued task without SQL", () => {
  it("creates case -> prompt -> response -> queued task", async () => {
    const caseId = await env.as("lead", (tx, a) => createCase(tx, a, { project_id: env.projectId, title: "Headache follow-up (test)", scenario, source_type: "template_synthetic", source_notes: "Synthetic test vignette.", synthetic_attestation: true }));
    await expectError(env.as("lead", (tx, a) => createCase(tx, a, { project_id: env.projectId, title: "Duplicate", scenario, source_type: "template_synthetic", source_notes: "Synthetic test vignette.", synthetic_attestation: true })), "conflict");
    const v = await env.as("lead", (tx, a) => savePromptVersion(tx, a, { case_id: caseId, prompt_text: "What are the red flags for this headache and when should the patient be reassessed?", template_key: null, tags: ["Neurology"], based_on_version: 0 }));
    const responseId = await env.as("lead", (tx, a) => attachResponse(tx, a, { prompt_version_id: v.id, provider: "manual-entry", model_name: "example", model_version: "1", response_text: "Fictional answer text." }));
    const taskId = await env.as("lead", (tx, a) => queueTask(tx, a, { response_id: responseId, priority: "normal", required_annotations: 2, annotator_ids: [env.actors.annotatorA.id, env.actors.annotatorB.id] }));
    const ctx = await env.as("annotatorB", (tx) => getTaskContext(tx, taskId));
    expect(ctx.task.status).toBe("in_progress");
    expect((await env.as("lead", (tx) => getPromptForCase(tx, caseId)))?.versions.length).toBe(1);
    await expectError(env.as("lead", (tx, a) => queueTask(tx, a, { response_id: responseId, priority: "normal", required_annotations: 1, annotator_ids: [] })), "conflict");
  });
});

describe("queue filters", () => {
  it("'needs my labeling' list and dashboard KPI use the same definition", async () => {
    const { listQueue } = await import("@/lib/services/tasks");
    for (const who of ["annotatorA", "annotatorB"] as const) {
      const [list, kpi] = await env.as(who, async (tx, a) => [await listQueue(tx, a, { needsMyAction: true }), await dashboardSummary(tx, a)] as const);
      expect(list.length).toBe(kpi.my_open_tasks);
      expect(list.every((t) => t.needs_my_action)).toBe(true);
    }
  });
  it("ignores malformed assignee filters instead of erroring", async () => {
    const { listQueue } = await import("@/lib/services/tasks");
    await expect(env.as("lead", (tx, a) => listQueue(tx, a, { assignee: "not-a-uuid" }))).resolves.toBeDefined();
  });
});
