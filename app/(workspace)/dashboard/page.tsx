import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ClipboardList, FolderKanban, Scale, ShieldCheck } from "lucide-react";
import { ActivityList } from "@/components/workflows/activity-list";
import { WorkflowStepper } from "@/components/workflows/workflow-stepper";
import { ButtonLink, Card, CardHeader, DemoBadge, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { PriorityChip, TaskStatusChip } from "@/components/ui/status";
import { pageQuery } from "@/lib/server/context";
import { dashboardSummary, listAuditEvents } from "@/lib/services/activity";
import { listQueue } from "@/lib/services/tasks";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { summary, mine, events } = await pageQuery(async (tx, actor) => ({
    summary: await dashboardSummary(tx, actor),
    mine: await listQueue(tx, actor, { needsMyAction: true }),
    events: await listAuditEvents(tx, { limit: 12 }),
  }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your work across projects. Every number below is a live count of database records you can access."
        actions={summary.demo_projects > 0 ? <DemoBadge /> : undefined}
      />
      <WorkflowStepper />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Active projects" value={summary.projects} icon={<FolderKanban className="size-5" />} hint={summary.demo_projects ? `${summary.demo_projects} seeded demo` : undefined} />
        <Stat label="My open labeling tasks" value={summary.my_open_tasks} icon={<ClipboardList className="size-5" />} />
        <Stat label="Reviews awaiting me" value={summary.reviews_due} icon={<ShieldCheck className="size-5" />} />
        <Stat label="Adjudications pending" value={summary.adjudications_due} icon={<Scale className="size-5" />} hint="for adjudicators" />
        <Stat label="Finalized records" value={`${summary.finalized} / ${summary.total_tasks}`} icon={<CheckCircle2 className="size-5" />} hint="tasks finalized / all tasks" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Needs my labeling" subtitle="Assigned to you and not yet submitted (or sent back)" actions={<ButtonLink href="/queue" size="sm">Open queue</ButtonLink>} />
          {mine.length ? (
            <ul className="divide-y divide-line">
              {mine.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <Link href={`/label/${t.id}`} className="font-medium text-ink hover:text-brand">{t.case_title}</Link>
                    <p className="text-xs text-ink-2">{t.project_name}</p>
                  </div>
                  <div className="flex items-center gap-2"><PriorityChip priority={t.priority} /><TaskStatusChip status={t.status} /></div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4"><EmptyState title="Nothing assigned to you">Tasks assigned to you as an annotator appear here.</EmptyState></div>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent activity" subtitle="From the append-only audit log" actions={<ButtonLink href="/team" size="sm">Audit log</ButtonLink>} />
          <ActivityList events={events} showProject />
        </Card>
      </div>
    </>
  );
}
