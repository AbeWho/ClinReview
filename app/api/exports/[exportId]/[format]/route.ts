import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { UUID_RE } from "@/lib/db/types";
import { toAppError } from "@/lib/services/core";
import { getExportArtifact } from "@/lib/services/exports";

/** Authorized download: identity from the signed session, access checked by RLS + role check. */
export async function GET(_req: Request, { params }: { params: Promise<{ exportId: string; format: string }> }) {
  const { exportId, format } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  if (!UUID_RE.test(exportId) || !["jsonl", "csv", "manifest"].includes(format)) return new Response("Not found", { status: 404 });
  try {
    const db = await getDb();
    const file = await db.withUser(user.id, (tx) => getExportArtifact(tx, { id: user.id, displayName: user.displayName }, exportId, format as "jsonl"));
    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const e = toAppError(error);
    return new Response(e.code === "forbidden" ? "Forbidden" : "Not found", { status: e.code === "forbidden" ? 403 : 404 });
  }
}
