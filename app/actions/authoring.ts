"use server";

import { revalidatePath } from "next/cache";
import { formString, runAction, type ActionResult } from "@/lib/server/context";
import { AppError } from "@/lib/services/core";
import { savePromptVersion } from "@/lib/services/prompts";
import { attachResponse } from "@/lib/services/responses";
import { assignAnnotator, queueTask, unassignAnnotator } from "@/lib/services/tasks";

export async function savePromptAction(_: ActionResult<unknown> | null, fd: FormData) {
  const caseId = formString(fd, "case_id");
  const r = await runAction((tx, a) => savePromptVersion(tx, a, {
    case_id: caseId,
    prompt_text: formString(fd, "prompt_text"),
    template_key: formString(fd, "template_key") || null,
    tags: formString(fd, "tags").split(",").map((t) => t.trim()).filter(Boolean),
    based_on_version: formString(fd, "based_on_version"),
  }));
  revalidatePath(`/cases/${caseId}`);
  return r.ok ? { ok: true as const, message: `Saved prompt version ${r.data?.version_number}.` } : r;
}

export async function attachResponseAction(_: ActionResult<unknown> | null, fd: FormData) {
  const caseId = formString(fd, "case_id");
  const r = await runAction((tx, a) => {
    let settings: unknown = {};
    const raw = formString(fd, "generation_settings").trim();
    if (raw) {
      try { settings = JSON.parse(raw); } catch { throw new AppError("invalid", "Generation settings must be valid JSON, e.g. {\"temperature\": 0.2}"); }
    }
    const generatedAt = formString(fd, "generated_at");
    return attachResponse(tx, a, {
      prompt_version_id: formString(fd, "prompt_version_id"),
      provider: formString(fd, "provider"),
      model_name: formString(fd, "model_name"),
      model_version: formString(fd, "model_version"),
      generation_settings: settings,
      response_text: formString(fd, "response_text"),
      generated_at: generatedAt ? new Date(generatedAt).toISOString() : null,
    });
  }, "Model response attached (immutable).");
  revalidatePath(`/cases/${caseId}`);
  return r;
}

export async function queueTaskAction(_: ActionResult<unknown> | null, fd: FormData) {
  const due = formString(fd, "due_at");
  const r = await runAction((tx, a) => queueTask(tx, a, {
    response_id: formString(fd, "response_id"),
    priority: formString(fd, "priority"),
    required_annotations: formString(fd, "required_annotations"),
    annotator_ids: fd.getAll("annotator_ids").map(String),
    due_at: due ? new Date(due).toISOString() : null,
  }), "Queued for labeling.");
  revalidatePath(`/cases/${formString(fd, "case_id")}`);
  return r;
}

export async function assignAction(_: ActionResult<unknown> | null, fd: FormData) {
  const r = await runAction((tx, a) => assignAnnotator(tx, a, formString(fd, "task_id"), formString(fd, "annotator_id")), "Assigned.");
  revalidatePath("/queue");
  return r;
}

export async function unassignAction(_: ActionResult<unknown> | null, fd: FormData) {
  const r = await runAction((tx, a) => unassignAnnotator(tx, a, formString(fd, "task_id"), formString(fd, "annotator_id")), "Unassigned.");
  revalidatePath("/queue");
  return r;
}
