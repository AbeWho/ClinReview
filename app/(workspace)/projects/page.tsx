import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { Badge, ButtonLink, Card, DemoBadge, EmptyState, PageHeader } from "@/components/ui/primitives";
import { pageQuery } from "@/lib/server/context";
import { listProjects } from "@/lib/services/projects";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const projects = await pageQuery((tx) => listProjects(tx, { includeArchived: archived === "1" }));
  return (
    <>
      <PageHeader title="Projects" icon={<FolderKanban className="size-6" />} description="Each project pins a taxonomy and rubric version and defines its review requirements."
        actions={<>
          <ButtonLink href={archived === "1" ? "/projects" : "/projects?archived=1"} variant="ghost" size="sm">{archived === "1" ? "Hide archived" : "Show archived"}</ButtonLink>
          <ButtonLink href="/projects/new" variant="primary"><Plus className="size-4" aria-hidden /> New project</ButtonLink>
        </>} />
      {projects.length === 0 ? (
        <EmptyState title="No projects yet" action={<ButtonLink href="/projects/new" variant="primary">Create a project</ButtonLink>}>Create a project to start adding synthetic cases.</EmptyState>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {projects.map((p) => {
            const pct = p.task_count ? Math.round((p.finalized_count / p.task_count) * 100) : 0;
            return (
              <li key={p.id}>
                <Card className="h-full p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Link href={`/projects/${p.id}`} className="text-base font-semibold text-ink hover:text-brand">{p.name}</Link>
                    <div className="flex gap-1.5">{p.is_demo && <DemoBadge />}{p.status === "archived" && <Badge>Archived</Badge>}</div>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-2">{p.clinical_domain} · owner {p.owner_name}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-ink">{p.dataset_purpose}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded-lg bg-canvas py-2"><p className="font-semibold tabular-nums">{p.case_count}</p><p className="text-xs text-ink-2">cases</p></div>
                    <div className="rounded-lg bg-canvas py-2"><p className="font-semibold tabular-nums">{p.task_count}</p><p className="text-xs text-ink-2">tasks</p></div>
                    <div className="rounded-lg bg-canvas py-2"><p className="font-semibold tabular-nums">{p.finalized_count}</p><p className="text-xs text-ink-2">finalized</p></div>
                  </div>
                  <div className="mt-3" aria-label={`${pct}% of tasks finalized`}>
                    <div className="h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full bg-brand" style={{ width: `${pct}%` }} /></div>
                    <p className="mt-1 text-xs text-ink-2">{p.finalized_count} of {p.task_count} tasks finalized · {p.taxonomy_label} · {p.rubric_label}</p>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
