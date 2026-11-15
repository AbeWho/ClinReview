import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";
import { WorkflowStepper } from "@/components/workflows/workflow-stepper";
import { ButtonLink, Card, CardHeader, EmptyState, formatDate, PageHeader } from "@/components/ui/primitives";
import { VerdictChip } from "@/components/ui/status";
import { pageQuery } from "@/lib/server/context";
import { listAdjudicationQueue, listCompletedAdjudications } from "@/lib/services/adjudications";

export const metadata: Metadata = { title: "QA / Adjudication" };

export default async function AdjudicationListPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const d = await pageQuery(async (tx) => ({ queue: await listAdjudicationQueue(tx), done: await listCompletedAdjudications(tx) }));
  return (
    <>
      <PageHeader title="QA / Adjudication" icon={<Scale className="size-6" />}
        description="When two approved independent annotations disagree on verdict or severity, an adjudicator records the final label. The original annotations are never modified." />
      <WorkflowStepper current="adjudication" projectId={project} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Disagreements awaiting adjudication" subtitle="Rule: approved annotations disagree when verdict OR severity differ" />
          {d.queue.length === 0 ? <div className="p-4"><EmptyState title="No open disagreements" /></div> : (
            <ul className="divide-y divide-line">
              {d.queue.map((q) => (
                <li key={q.task_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <Link href={`/adjudication/${q.task_id}`} className="font-medium hover:text-brand">{q.case_title}</Link>
                    <p className="text-xs text-ink-2">{q.project_name}</p>
                    <div className="mt-1 flex gap-1.5">{q.verdicts.map((v, i) => <VerdictChip key={i} verdict={v} />)}</div>
                  </div>
                  <ButtonLink href={`/adjudication/${q.task_id}`} variant="primary" size="sm">Compare</ButtonLink>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Completed adjudications" />
          {d.done.length === 0 ? <p className="p-4 text-sm text-ink-2">None yet.</p> : (
            <ul className="divide-y divide-line">
              {d.done.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><Link href={`/label/${a.task_id}`} className="font-medium hover:text-brand">{a.case_title}</Link><VerdictChip verdict={a.final_verdict} /></div>
                  <p className="text-xs text-ink-2">{a.adjudicator_name} · {formatDate(a.created_at)}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs">{a.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
