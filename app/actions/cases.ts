"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formString, runAction, type ActionResult } from "@/lib/server/context";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { commitCaseImport, createCase, previewCaseImport, updateCase, type ImportPreviewRow } from "@/lib/services/cases";

function caseFromForm(fd: FormData) {
  const f = (k: string) => formString(fd, k);
  return {
    project_id: f("project_id"),
    title: f("title"),
    source_type: f("source_type"),
    source_notes: f("source_notes"),
    synthetic_attestation: fd.get("synthetic_attestation") === "on",
    scenario: {
      age_band: f("age_band"), sex: f("sex"), chief_complaint: f("chief_complaint"), hpi: f("hpi"), past_history: f("past_history"),
      comorbidities: f("comorbidities"), medications: f("medications"), allergies: f("allergies"), labs: f("labs"), social_factors: f("social_factors"),
      vitals: { bp: f("bp"), hr: f("hr"), rr: f("rr"), spo2: f("spo2"), temp_c: f("temp_c") },
    },
  };
}

export async function createCaseAction(_: ActionResult<unknown> | null, fd: FormData) {
  const r = await runAction((tx, a) => createCase(tx, a, caseFromForm(fd)));
  if (r.ok) redirect(`/cases/${r.data}`);
  return r;
}

export async function updateCaseAction(_: ActionResult<unknown> | null, fd: FormData) {
  const caseId = formString(fd, "case_id");
  const r = await runAction((tx, a) => updateCase(tx, a, caseId, caseFromForm(fd)));
  if (r.ok) {
    revalidatePath(`/cases/${caseId}`);
    redirect(`/cases/${caseId}`);
  }
  return r;
}

export interface ImportRequest { project_id: string; file_name: string; mime_type: string; content: string }

/** Dry run: nothing is written. */
export async function previewImportAction(req: ImportRequest): Promise<ActionResult<{ rows: ImportPreviewRow[]; valid: number }>> {
  return runAction(async (tx, a) => {
    checkRateLimit(a.id, "import");
    const { rows, valid } = await previewCaseImport(tx, a, req);
    return { rows, valid };
  });
}

export async function commitImportAction(req: ImportRequest, attested: boolean) {
  const r = await runAction((tx, a) => {
    checkRateLimit(a.id, "import");
    return commitCaseImport(tx, a, req, attested);
  });
  if (r.ok) revalidatePath("/cases");
  return r;
}
