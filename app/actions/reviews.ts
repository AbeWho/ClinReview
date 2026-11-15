"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formString, runAction, type ActionResult } from "@/lib/server/context";
import { submitAdjudication } from "@/lib/services/adjudications";
import { submitReview } from "@/lib/services/reviews";
import { REVIEW_CHECKLIST } from "@/lib/validation/forms";

export async function submitReviewAction(_: ActionResult<unknown> | null, fd: FormData) {
  const r = await runAction((tx, a) => submitReview(tx, a, {
    annotation_id: formString(fd, "annotation_id"),
    decision: formString(fd, "decision"),
    comments: formString(fd, "comments"),
    checklist: Object.fromEntries(REVIEW_CHECKLIST.map((c) => [c.key, fd.get(`check_${c.key}`) === "on"])),
  }));
  if (r.ok) {
    revalidatePath("/review");
    redirect(`/review?done=${formString(fd, "decision")}`);
  }
  return r;
}

export async function submitAdjudicationAction(_: ActionResult<unknown> | null, fd: FormData) {
  const taskId = formString(fd, "task_id");
  const r = await runAction((tx, a) => {
    const final = JSON.parse(formString(fd, "final_json") || "{}");
    return submitAdjudication(tx, a, { task_id: taskId, reason: formString(fd, "reason"), final });
  });
  if (r.ok) {
    revalidatePath("/adjudication");
    redirect(`/label/${taskId}`);
  }
  return r;
}
