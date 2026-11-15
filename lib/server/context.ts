import { ZodError } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { Tx } from "@/lib/db/types";
import { AppError, toAppError, type Actor } from "@/lib/services/core";

/** Run a read/write as the signed-in user inside one RLS-scoped transaction. */
export async function withActor<T>(fn: (tx: Tx, actor: Actor) => Promise<T>): Promise<T> {
  const user = await requireUser();
  const db = await getDb();
  const actor: Actor = { id: user.id, displayName: user.displayName };
  return db.withUser(user.id, (tx) => fn(tx, actor));
}

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]>; code?: AppError["code"] };

/** Wrap a server action body: run as the actor, convert failures into a serializable result. */
export async function runAction<T>(fn: (tx: Tx, actor: Actor) => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await withActor(fn);
    return { ok: true, message, data };
  } catch (error) {
    // Next.js uses thrown errors for redirect()/notFound(); let those through.
    if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_")) throw error;
    if (error instanceof ZodError) return { ok: false, error: "Invalid input.", code: "invalid" };
    const e = toAppError(error);
    if (e.code === "invalid_state" && !(error instanceof AppError)) console.error(error);
    return { ok: false, error: e.message, fieldErrors: e.fieldErrors, code: e.code };
  }
}

export function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

/** For server-component pages: like withActor, but "not found / no access" renders the 404 page. */
export async function pageQuery<T>(fn: (tx: Tx, actor: Actor) => Promise<T>): Promise<T> {
  try {
    return await withActor(fn);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    if (toAppError(error).code === "not_found") {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    throw error;
  }
}
