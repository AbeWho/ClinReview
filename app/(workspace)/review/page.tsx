import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { WorkflowStepper } from "@/components/workflows/workflow-stepper";
import { ButtonLink, Card, CardHeader, EmptyState, formatDate, Notice, PageHeader } from "@/components/ui/primitives";
import { DecisionChip, SeverityChip, VerdictChip } from "@/components/ui/status";
import { pageQuery } from "@/lib/server/context";
import { listRecentReviews, listReviewQueue } from "@/lib/services/reviews";

export const metadata: Metadata = { title: "Clinical Review" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ done?: string; project?: string }> }) {
  const { done, project } = await searchParams;
  const d = await pageQuery(async (tx, actor) => ({
    queue: await listReviewQueue(tx, actor),
    recent: await listRecentReviews(tx, 15),
    isReviewer: (await tx.query("select 1 from project_members where user_id = $1 and role = 'reviewer'", [actor.id])).length > 0,
  }));
  return (
    <>
      <PageHeader title="Clinical Review" icon={<ShieldCheck className="size-6" />} description="Second-pass evaluation of submitted annotations. You never see your own annotations here: independent review is enforced by the server and the database." />
      <WorkflowStepper current="review" projectId={project} />
      {done && <div className="mb-4"><Notice tone="ok">Review recorded ({done.replace("_", " ")}). The task status was recomputed.</Notice></div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Awaiting your review" subtitle={`${d.queue.length} annotation(s)`} />
          {!d.isReviewer ? <div className="p-4"><EmptyState title="You are not a reviewer on any project">Sign in as Demo Reviewer to try the review flow.</EmptyState></div>
            : d.queue.length === 0 ? <div className="p-4"><EmptyState title="Review queue is empty" /></div> : (
            <ul className="divide-y divide-line">
              {d.queue.map((q) => (
                <li key={q.annotation_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <Link href={`/review/${q.annotation_id}`} className="font-medium hover:text-brand">{q.case_title}</Link>
                    <p className="text-xs text-ink-2">{q.annotator_name} · revision {q.revision} · submitted {formatDate(q.submitted_at)}</p>
                    <div className="mt-1 flex gap-1.5"><VerdictChip verdict={q.verdict} /><SeverityChip severity={q.severity} /></div>
                  </div>
                  <ButtonLink href={`/review/${q.annotation_id}`} variant="primary" size="sm">Review</ButtonLink>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent review decisions" />
          {d.recent.length === 0 ? <p className="p-4 text-sm text-ink-2">None yet.</p> : (
            <ul className="divide-y divide-line">
              {d.recent.map((r) => (
                <li key={r.id} className="px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/label/${r.task_id}`} className="font-medium hover:text-brand">{r.case_title}</Link>
                    <DecisionChip decision={r.decision} />
                  </div>
                  <p className="text-xs text-ink-2">{r.reviewer_name} reviewed {r.annotator_name} · {formatDate(r.created_at)}</p>
                  {r.comments && <p className="mt-0.5 line-clamp-2 text-xs">{r.comments}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
