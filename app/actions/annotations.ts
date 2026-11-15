"use server";

import { revalidatePath } from "next/cache";
import { UUID_RE } from "@/lib/db/types";
import { formString, runAction, type ActionResult } from "@/lib/server/context";
import { saveDraft, startOrResumeAnnotation, submitAnnotation } from "@/lib/services/annotations";
import { AppError } from "@/lib/services/core";

const id = (v: unknown) => {
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new AppError("invalid", "Invalid id.");
  return v;
};

export async function startAnnotationAction(_: ActionResult<unknown> | null, fd: FormData) {
  const taskId = formString(fd, "task_id");
  const r = await runAction((tx, a) => startOrResumeAnnotation(tx, a, id(taskId)));
  revalidatePath(`/label/${taskId}`);
  return r;
}

export async function saveDraftAction(annotationId: string, lockVersion: number, payload: unknown): Promise<ActionResult<{ lock_version: number; updated_at: Date }>> {
  return runAction((tx, a) => saveDraft(tx, a, id(annotationId), Number(lockVersion), payload));
}

export async function submitAnnotationAction(annotationId: string, lockVersion: number, taskId: string) {
  const r = await runAction((tx, a) => submitAnnotation(tx, a, id(annotationId), Number(lockVersion)), "Annotation submitted for independent review.");
  if (r.ok) revalidatePath(`/label/${taskId}`);
  return r;
}
