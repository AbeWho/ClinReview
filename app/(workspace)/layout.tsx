import { LogOut, UserRound } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { DisclaimerBar } from "@/components/layout/disclaimer";
import { Logo } from "@/components/layout/logo";
import { MobileNav, SidebarNav } from "@/components/layout/sidebar-nav";
import { Badge, buttonClasses } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { dashboardSummary } from "@/lib/services/activity";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = await getDb();
  const [summary, roles] = await db.withUser(user.id, async (tx) => [
    await dashboardSummary(tx, { id: user.id, displayName: user.displayName }),
    (await tx.query<{ role: string }>("select distinct role from project_members where user_id = $1 order by role", [user.id])).map((r) => r.role),
  ] as const);
  const badges = { "/queue": summary.my_open_tasks, "/review": summary.reviews_due, "/adjudication": summary.adjudications_due };

  const personaBox = (
    <div className="flex items-center gap-2 text-sm">
      <span className="flex size-8 items-center justify-center rounded-full bg-canvas text-ink-2 ring-1 ring-line" aria-hidden><UserRound className="size-4" /></span>
      <div className="min-w-0 leading-tight">
        <p className="max-w-[140px] truncate font-medium sm:max-w-none">{user.displayName}<span className="sm:hidden"> (simulated)</span></p>
        <p className="truncate text-xs text-ink-2">{roles.length ? roles.join(", ") : "no project roles"}</p>
      </div>
      {user.isDemoPersona && <Badge tone="violet" className="hidden sm:inline-flex">Simulated persona</Badge>}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <DisclaimerBar />
      <div className="flex flex-1">
        <aside className="hidden w-[228px] shrink-0 flex-col border-r border-line bg-white px-3 py-4 md:flex" aria-label="Primary">
          <div className="px-2 pb-4"><Logo /></div>
          <nav aria-label="Main navigation"><SidebarNav badges={badges} /></nav>
          <p className="mt-auto px-2 pt-6 text-[11px] leading-snug text-ink-2">Independent portfolio project. Labels are educational judgments, not validated clinical ground truth.</p>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-2.5 md:px-6">
            <div className="flex items-center gap-3 md:hidden"><MobileNav badges={badges} /></div>
            <div className="hidden md:block" />
            <div className="flex items-center gap-3">
              {personaBox}
              <form action={signOut}>
                <button type="submit" className={buttonClasses("ghost", "sm")} title="Switch persona / sign out">
                  <LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline">Switch persona</span>
                </button>
              </form>
            </div>
          </header>
          <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
