import Link from "next/link";
import { ClipboardCheck, Database, Download, FileText, ListChecks, PencilLine, Users } from "lucide-react";
import { cn } from "@/components/ui/cn";

export type StageKey = "setup" | "intake" | "prompt" | "queue" | "review" | "adjudication" | "export";

const STAGES: { key: StageKey; label: string; href: string; icon: typeof Database }[] = [
  { key: "setup", label: "Project Setup", href: "/projects", icon: ClipboardCheck },
  { key: "intake", label: "Case Intake", href: "/cases", icon: Database },
  { key: "prompt", label: "Prompt Design", href: "/prompts", icon: PencilLine },
  { key: "queue", label: "Labeling Queue", href: "/queue", icon: ListChecks },
  { key: "review", label: "Clinical Review", href: "/review", icon: FileText },
  { key: "adjudication", label: "QA / Adjudication", href: "/adjudication", icon: Users },
  { key: "export", label: "Export Dataset", href: "/exports", icon: Download },
];

/**
 * Navigation aid across the seven workflow stages. Counts (when provided) are real record
 * counts for the current project; this is not a single fabricated "progress" tracker.
 */
export function WorkflowStepper({ current, counts, projectId }: { current?: StageKey; counts?: Partial<Record<StageKey, number>>; projectId?: string }) {
  return (
    <nav aria-label="Workflow stages" className="mb-5 overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-card)]">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const active = s.key === current;
          const href = projectId && s.key !== "setup" ? `${s.href}?project=${projectId}` : s.key === "setup" && projectId ? `/projects/${projectId}` : s.href;
          return (
            <li key={s.key} className="flex items-center">
              {i > 0 && <span aria-hidden className="mx-0.5 h-px w-3 bg-line" />}
              <Link href={href} aria-current={active ? "step" : undefined}
                className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium", active ? "bg-brand-pale text-brand-dark ring-1 ring-brand/30" : "text-ink-2 hover:bg-canvas hover:text-ink")}>
                <Icon className="size-3.5" aria-hidden />
                <span>{i + 1}. {s.label}</span>
                {counts?.[s.key] !== undefined && <span className="rounded bg-canvas px-1 tabular-nums text-ink-2">{counts[s.key]}</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
