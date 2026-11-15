import type { Metadata } from "next";
import { ShieldAlert, UserRound } from "lucide-react";
import { signInAsPersona } from "@/app/actions/auth";
import { DISCLAIMER } from "@/components/layout/disclaimer";
import { Logo } from "@/components/layout/logo";
import { Badge, Card } from "@/components/ui/primitives";
import { demoAuthEnabled } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DEMO_PERSONAS } from "@/lib/db/seed";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const enabled = demoAuthEnabled();
  const db = await getDb();
  const profiles = enabled
    ? await db.withSystem((tx) => tx.query<{ id: string; email: string; display_name: string }>("select id, email, display_name from profiles where is_demo_persona order by created_at"))
    : [];

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-10">
      <Logo />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Sign in to the demo workspace</h1>
      <p className="mt-1 text-sm text-ink-2">
        Choose a <strong>simulated demo persona</strong>. Each persona has a different project role so you can walk through labeling,
        independent review and adjudication yourself. Personas are not real people and hold no clinical credentials.
      </p>
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-pale px-3 py-2 text-sm">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        <p>{DISCLAIMER} Synthetic data only.</p>
      </div>

      {!enabled ? (
        <Card className="mt-6 p-5 text-sm">Demo sign-in is disabled in this environment. Set <code>DEMO_AUTH_ENABLED=true</code> to enable it.</Card>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {DEMO_PERSONAS.map((p) => {
            const profile = profiles.find((x) => x.email === p.email);
            if (!profile) return null;
            return (
              <li key={p.key}>
                <form action={signInAsPersona}>
                  <input type="hidden" name="persona_id" value={profile.id} />
                  <input type="hidden" name="next" value={next ?? ""} />
                  <button type="submit" className="group flex w-full items-start gap-3 rounded-xl border border-line bg-white p-4 text-left shadow-[var(--shadow-card)] transition hover:border-brand/40 hover:bg-brand-pale/40">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-2 group-hover:bg-white" aria-hidden><UserRound className="size-4" /></span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                        {profile.display_name} <Badge tone="violet">Simulated</Badge>
                      </span>
                      <span className="mt-0.5 block text-xs font-medium uppercase tracking-wide text-brand-dark">{p.role}</span>
                      <span className="mt-1 block text-sm text-ink-2">{p.blurb}</span>
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 text-xs text-ink-2">ClinReview is an independent portfolio project. It is not affiliated with any healthcare organization and is not HIPAA-certified.</p>
    </main>
  );
}
