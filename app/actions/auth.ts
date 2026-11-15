"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie, demoAuthEnabled, setSessionCookie } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { UUID_RE } from "@/lib/db/types";

export async function signInAsPersona(formData: FormData) {
  if (!demoAuthEnabled()) throw new Error("Demo sign-in is disabled in this environment.");
  const id = String(formData.get("persona_id") ?? "");
  if (!UUID_RE.test(id)) throw new Error("Invalid persona");
  const db = await getDb();
  // Only seeded, clearly-labeled demo personas can be used with demo sign-in.
  const [row] = await db.withSystem((tx) => tx.query<{ id: string }>("select id from profiles where id = $1 and is_demo_persona", [id]));
  if (!row) throw new Error("Unknown demo persona");
  await setSessionCookie(row.id);
  redirect(String(formData.get("next") ?? "").startsWith("/") && !String(formData.get("next")).startsWith("//") ? String(formData.get("next")) : "/dashboard");
}

export async function signOut() {
  await clearSessionCookie();
  redirect("/signin");
}
