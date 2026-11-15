import type { Database, Tx } from "./types";
import { APP_ROLE } from "./types";
import { DEFAULT_RUBRIC, DEFAULT_TAXONOMY } from "@/lib/taxonomy/defaults";
import type { Actor } from "@/lib/services/core";
import { addMember, createProject } from "@/lib/services/projects";
import { createCase } from "@/lib/services/cases";
import { savePromptVersion } from "@/lib/services/prompts";
import { attachResponse } from "@/lib/services/responses";
import { queueTask } from "@/lib/services/tasks";
import { saveDraft, startOrResumeAnnotation, submitAnnotation, getAnnotation } from "@/lib/services/annotations";
import { submitReview } from "@/lib/services/reviews";
import { submitAdjudication } from "@/lib/services/adjudications";
import { DEMO_CASES, type DemoLabel } from "./seed-content";

/** Simulated personas. Names make clear they are not real clinicians. `.invalid` is a reserved TLD. */
export const DEMO_PERSONAS = [
  { key: "lead", email: "demo.lead@clinreview.invalid", display_name: "Demo Project Lead", role: "owner", blurb: "Sets up the project, writes synthetic cases and prompts, assigns work, exports datasets." },
  { key: "annotatorA", email: "demo.annotator.a@clinreview.invalid", display_name: "Demo Annotator A", role: "annotator", blurb: "Labels assigned model responses." },
  { key: "annotatorB", email: "demo.annotator.b@clinreview.invalid", display_name: "Demo Annotator B", role: "annotator", blurb: "Second independent labeler (blind to Annotator A)." },
  { key: "reviewer", email: "demo.reviewer@clinreview.invalid", display_name: "Demo Reviewer", role: "reviewer", blurb: "Independently reviews submitted annotations." },
  { key: "adjudicator", email: "demo.adjudicator@clinreview.invalid", display_name: "Demo Adjudicator", role: "adjudicator", blurb: "Resolves disagreements between approved annotations." },
  { key: "viewer", email: "demo.viewer@clinreview.invalid", display_name: "Demo Viewer", role: "viewer", blurb: "Read-only access." },
] as const;
export type PersonaKey = (typeof DEMO_PERSONAS)[number]["key"];

export const DEMO_PROJECT_NAME = "Heart Failure & Medication Safety Reasoning (Demo)";

async function actAs(tx: Tx, userId: string) {
  await tx.query("reset role");
  await tx.query("select set_config('app.user_id', $1, true)", [userId]);
  await tx.query(`set local role ${APP_ROLE}`);
}

async function labelAndSubmit(tx: Tx, actor: Actor, taskId: string, label: DemoLabel, responseText: string) {
  const annotationId = await startOrResumeAnnotation(tx, actor, taskId);
  if (!annotationId) throw new Error("seed: could not open annotation");
  const evidence = label.evidence.map((e) => {
    const start = responseText.indexOf(e.quote);
    if (start < 0) throw new Error(`seed: evidence quote not found: ${e.quote}`);
    return { start, end: start + e.quote.length, quote: e.quote, issue_category: e.category, notes: e.notes ?? "" };
  });
  const a = await getAnnotation(tx, annotationId);
  const saved = await saveDraft(tx, actor, annotationId, a.lock_version, { labels: label.labels, rationale: label.rationale, confidence: label.confidence, evidence });
  await submitAnnotation(tx, actor, annotationId, saved.lock_version);
  return annotationId;
}

/** Idempotent: does nothing if the demo personas already exist. Runs as ONE transaction. */
export async function ensureDemoSeed(db: Database): Promise<boolean> {
  const exists = await db.withSystem((tx) => tx.query("select 1 from profiles where email = $1", [DEMO_PERSONAS[0].email]));
  if (exists.length) return false;

  await db.withSystem(async (tx) => {
    const ids = {} as Record<PersonaKey, Actor>;
    for (const p of DEMO_PERSONAS) {
      const [row] = await tx.query<{ id: string }>(
        "insert into profiles (email, display_name, is_demo_persona, training_disclosure) values ($1,$2,true,$3) returning id",
        [p.email, p.display_name, "Simulated demo persona. Not a real person or clinician."],
      );
      ids[p.key] = { id: row!.id, displayName: p.display_name };
    }
    const [tax] = await tx.query<{ id: string }>(
      "insert into taxonomy_versions (name, version, definitions_json, published_at) values ('ClinReview Clinical Safety Taxonomy', '1.0.0', $1, now()) returning id",
      [JSON.stringify(DEFAULT_TAXONOMY)],
    );
    const [rub] = await tx.query<{ id: string }>(
      "insert into rubric_versions (name, version, definitions_json, published_at) values ('ClinReview Response Rubric', '1.0.0', $1, now()) returning id",
      [JSON.stringify(DEFAULT_RUBRIC)],
    );

    // --- Project setup as the demo lead -------------------------------------------------
    await actAs(tx, ids.lead.id);
    const projectId = await createProject(tx, ids.lead, {
      name: DEMO_PROJECT_NAME,
      clinical_domain: "Cardiology & medication safety",
      description: "Demo Data. Fictional, fully synthetic vignettes with intentionally imperfect fictional model answers, used to demonstrate the annotation workflow. Labels are illustrative and require qualified expert review before any use as ground truth.",
      dataset_purpose: "Evaluate clinical reasoning and medication-safety errors in model answers to synthetic vignettes; produce a versioned JSONL evaluation set.",
      taxonomy_version_id: tax!.id,
      rubric_version_id: rub!.id,
      default_required_annotations: 1,
      blind_annotation: true,
    });
    // Flagging a project as demo is a system operation (the app role is not allowed to change it).
    await tx.query("reset role");
    await tx.query("update projects set is_demo = true where id = $1", [projectId]);
    await actAs(tx, ids.lead.id);
    for (const p of DEMO_PERSONAS) if (p.role !== "owner") await addMember(tx, ids.lead, projectId, ids[p.key].id, p.role);

    // --- Cases, prompts, responses, tasks -----------------------------------------------
    const tasks: { taskId: string; responseText: string; demo: (typeof DEMO_CASES)[number] }[] = [];
    for (const demo of DEMO_CASES) {
      await actAs(tx, ids.lead.id);
      const caseId = await createCase(tx, ids.lead, {
        project_id: projectId, title: demo.title, scenario: demo.scenario, source_type: "authored_synthetic",
        source_notes: "Demo Data: fictional vignette authored for ClinReview; not derived from any patient record.",
        synthetic_attestation: true,
      }, { isDemo: true });
      const v = await savePromptVersion(tx, ids.lead, { case_id: caseId, prompt_text: demo.prompt, template_key: demo.template, tags: demo.tags, based_on_version: 0 });
      const responseId = await attachResponse(tx, ids.lead, {
        prompt_version_id: v.id, provider: "demo-fixture", model_name: "fictional-demo-model", model_version: "example-1",
        generation_settings: { note: "Prewritten fictional answer; no model was called" }, response_text: demo.response, generated_at: null,
      }, { origin: "seed" });
      const taskId = await queueTask(tx, ids.lead, {
        response_id: responseId, priority: demo.priority, required_annotations: demo.required_annotations,
        annotator_ids: demo.assign.map((k) => ids[k].id), due_at: null,
      });
      tasks.push({ taskId, responseText: demo.response, demo });
    }

    // --- Labeling, review and adjudication through the real workflow --------------------
    for (const { taskId, responseText, demo } of tasks) {
      for (const label of demo.labels) {
        await actAs(tx, ids[label.annotator].id);
        const annotationId = await labelAndSubmit(tx, ids[label.annotator], taskId, label, responseText);
        if (label.review) {
          await actAs(tx, ids.reviewer.id);
          await submitReview(tx, ids.reviewer, { annotation_id: annotationId, decision: label.review.decision, comments: label.review.comments, checklist: { verdict_supported: true, severity_justified: true, evidence_matches: true, labels_distinct: true, uncertainty_handled: true } });
        }
      }
      if (demo.adjudication) {
        await actAs(tx, ids.adjudicator.id);
        await submitAdjudication(tx, ids.adjudicator, { task_id: taskId, reason: demo.adjudication.reason, final: demo.adjudication.final });
      }
    }
    await tx.query("reset role");
  });
  return true;
}
