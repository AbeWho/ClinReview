"use server";

import { revalidatePath } from "next/cache";
import { formString, runAction, type ActionResult } from "@/lib/server/context";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { createExport } from "@/lib/services/exports";

export async function createExportAction(_: ActionResult<unknown> | null, fd: FormData) {
  const r = await runAction((tx, a) => {
    checkRateLimit(a.id, "export");
    return createExport(tx, a, {
      project_id: formString(fd, "project_id"),
      split_seed: formString(fd, "split_seed"),
      semantic_version: formString(fd, "semantic_version"),
      notes: formString(fd, "notes"),
    });
  });
  revalidatePath("/exports");
  return r.ok ? { ok: true as const, message: `Created immutable export v${r.data?.version} with ${r.data?.recordCount} records (sha256 ${r.data?.contentHash.slice(0, 12)}…).` } : r;
}
