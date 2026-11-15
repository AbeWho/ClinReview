"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, ClipboardList, Database, Download, FolderKanban, LayoutDashboard, ListChecks, PencilLine, Scale, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/components/ui/cn";

export const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/cases", label: "Case Intake", icon: Database },
  { href: "/prompts", label: "Prompt Builder", icon: PencilLine },
  { href: "/queue", label: "Labeling Queue", icon: ListChecks },
  { href: "/review", label: "Clinical Review", icon: ShieldCheck },
  { href: "/adjudication", label: "QA / Adjudication", icon: Scale },
  { href: "/taxonomy", label: "Taxonomy & Rubric", icon: BookOpen },
  { href: "/exports", label: "Exports", icon: Download },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/team", label: "Team & Audit", icon: Users },
] as const;

export function SidebarNav({ badges = {} }: { badges?: Partial<Record<string, number>> }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`) || (href === "/queue" && pathname.startsWith("/label"));
        const badge = badges[href];
        return (
          <li key={href}>
            <Link href={href} aria-current={active ? "page" : undefined}
              className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium", active ? "bg-brand-pale text-brand-dark" : "text-ink-2 hover:bg-canvas hover:text-ink")}>
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{label}</span>
              {badge ? <span className="rounded-full bg-white px-1.5 text-xs tabular-nums text-ink-2 ring-1 ring-line" aria-label={`${badge} pending`}>{badge}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function MobileNav({ badges }: { badges?: Partial<Record<string, number>> }) {
  return (
    <details className="group md:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium">
        <ClipboardList className="size-4" aria-hidden /> Menu
      </summary>
      <div className="absolute inset-x-3 z-40 mt-2 rounded-xl border border-line bg-white p-2 shadow-lg">
        <SidebarNav badges={badges} />
      </div>
    </details>
  );
}
