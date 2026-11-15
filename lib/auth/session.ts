import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { UUID_RE } from "@/lib/db/types";

export const SESSION_COOKIE = "clinreview_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const DEV_FALLBACK_SECRET = "dev-only-insecure-secret-change-me-0123456789abcdef";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (32+ chars) must be set in production.");
  return DEV_FALLBACK_SECRET;
}

/** Demo persona sign-in: on by default in development, opt-in (DEMO_AUTH_ENABLED=true) in production. */
export function demoAuthEnabled(): boolean {
  if (process.env.DEMO_AUTH_ENABLED === "false") return false;
  if (process.env.NODE_ENV === "production") return process.env.DEMO_AUTH_ENABLED === "true";
  return true;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function encodeSession(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now + SESSION_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${userId}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (!UUID_RE.test(userId) || Number(exp) < now) return null;
  return userId;
}

export async function setSessionCookie(userId: string) {
  (await cookies()).set(SESSION_COOKIE, encodeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export interface SessionUser {
  id: string;
  displayName: string;
  email: string;
  isDemoPersona: boolean;
}

/** Verified current user, or null. Always re-validated against the database. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const userId = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const db = await getDb();
  const [row] = await db.withUser(userId, (tx) =>
    tx.query<{ id: string; display_name: string; email: string; is_demo_persona: boolean }>("select id, display_name, email, is_demo_persona from profiles where id = $1", [userId]),
  );
  return row ? { id: row.id, displayName: row.display_name, email: row.email, isDemoPersona: row.is_demo_persona } : null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}
