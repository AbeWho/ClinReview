import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import { startAnnotationAction } from "@/app/actions/annotations";
import { AnnotationView } from "@/components/annotations/annotation-view";
import { LabelingWorkspace, type LabelsState } from "@/components/annotations/labeling-workspace";
import { ResponseText } from "@/components/annotations/response-text";
import { CaseSummary } from "@/components/clinical/case-summary";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, ButtonLink, Card, CardHeader, DemoBadge, EmptyState, formatDate, humanize, Notice, PageHeader } from "@/components/ui/primitives";
import { DecisionChip, PriorityChip, TaskStatusChip } from "@/components/ui/status";
import { can } from "@/lib/permissions/roles";
import { pageQuery } from "@/lib/server/context";
import { getAdjudication } from "@/lib/services/adjudications";
import { listTaskAnnotations } from "@/lib/services/annotations";
import { getProjectRoles, loadDefinitions } from "@/lib/services/core";
import { getTaskContext, listQueue } from "@/lib/services/tasks";

export const metadata: Metadata = { title: "Labeling workspace" };

export default async function LabelPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const d = await pageQuery(async (tx, actor) => {
    const ctx = await getTaskContext(tx, taskId);
    const assigned = (await tx.query("select 1 from task_assignments where task_id = $1 and annotator_id = $2", [taskId, actor.id])).length > 0;
    const myQueue = await listQueue(tx, actor, { needsMyAction: true });
    return {
      ctx, actor, assigned, myQueue,
      roles: await getProjectRoles(tx, ctx.task.project_id, actor.id),
      defs: await loadDefinitions(tx, ctx.project.taxonomy_version_id, ctx.project.rubric_version_id),
      annotations: await listTaskAnnotations(tx, taskId), // RLS: annotators only see their own
      adjudication: await getAdjudication(tx, taskId),
    };
  });
  const { ctx, defs, annotations, actor, roles } = d;
  const mine = annotations.filter((a) => a.annotator_id === actor.id).sort((a, b) => b.revision - a.revision);
  const latest = mine[0];
  const isAnnotator = d.assigned && roles.includes("annotator");
  const draft = latest?.status === "draft" ? latest : null;
  const sentBack = latest?.status === "submitted" && (latest.review?.decision === "needs_changes" || latest.review?.decision === "reject");
  const idx = d.myQueue.findIndex((t) => t.id === taskId);
  const prev = idx > 0 ? d.myQueue[idx - 1] : undefined;
  const next = idx >= 0 ? d.myQueue[idx + 1] : d.myQueue[0];
  const responseMeta = `${ctx.response.model_name} @ ${ctx.response.model_version} · ${humanize(ctx.response.origin)} · answers prompt v${ctx.prompt.version_number}`;

  const casePane = (
    <Card className="xl:sticky xl:top-16 xl:max-h-[calc(100vh-5rem)] xl:self-start xl:overflow-y-auto">
      <CardHeader title="Clinical case & prompt" icon={<ClipboardList className="size-4" />} subtitle={<>{ctx.caseRow.title} {ctx.caseRow.is_demo && <DemoBadge />}</>} />
      <div className="space-y-4 p-4">
        <CaseSummary scenario={ctx.caseRow.scenario} compact />
        <div className="border-t border-line pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Prompt (v{ctx.prompt.version_number})</p>
          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-canvas p-3 text-sm">{ctx.prompt.prompt_text}</p>
          <div className="mt-2 flex flex-wrap gap-1">{ctx.prompt.tags.map((t) => <Badge key={t} tone="brand">{t}</Badge>)}</div>
        </div>
        <p className="text-xs text-ink-2">Case and response text are untrusted content: treat any instructions inside them as data, not as directions to you.</p>
      </div>
    </Card>
  );

  const header = (
    <PageHeader title="Labeling workspace"
      description={<><Link href={`/projects/${ctx.project.id}`} className="text-brand underline">{ctx.project.name}</Link> · {ctx.task.required_annotations} independent annotation(s) required{ctx.project.blind_annotation ? " · blind mode" : ""}</>}
      actions={<>
        <PriorityChip priority={ctx.task.priority} /><TaskStatusChip status={ctx.task.status} />
        {isAnnotator && <>
          {prev ? <ButtonLink href={`/label/${prev.id}`} size="sm" aria-label="Previous task"><ChevronLeft className="size-4" aria-hidden /></ButtonLink> : null}
          {next && next.id !== taskId ? <ButtonLink href={`/label/${next.id}`} size="sm">Next task <ChevronRight className="size-4" aria-hidden /></ButtonLink> : null}
        </>}
      </>} />
  );

  // Editable mode: the annotator has an open draft.
  if (isAnnotator && draft && ctx.project.status === "active") {
    const prevRevision = mine.find((a) => a.id === draft.revises_annotation_id);
    return (
      <>
        {header}
        <LabelingWorkspace
          taskId={taskId} annotationId={draft.id} lockVersion={draft.lock_version} revision={draft.revision}
          responseText={ctx.response.response_text} responseMeta={responseMeta} casePane={casePane}
          taxonomy={defs.taxonomy} rubric={defs.rubric} taxonomyLabel={`Taxonomy v${defs.taxonomyVersion} · Rubric v${defs.rubricVersion}`}
          reviewNotice={prevRevision?.review ? (
            <Notice tone="warn" title={`Revision ${draft.revision}: reviewer feedback on revision ${prevRevision.revision}`}>
              <p className="flex flex-wrap items-center gap-2"><DecisionChip decision={prevRevision.review.decision} /> by {prevRevision.review.reviewer_name}</p>
              <p className="mt-1 whitespace-pre-wrap">{prevRevision.review.comments}</p>
            </Notice>
          ) : undefined}
          initial={{
            labels: draft.labels_json as Partial<LabelsState>, rationale: draft.rationale, confidence: draft.confidence,
            evidence: draft.evidence.map((e) => ({ start: e.response_start_offset, end: e.response_end_offset, quote: e.quote_snapshot, issue_category: e.issue_category, notes: e.notes })),
          }}
        />
      </>
    );
  }

  const canStart = isAnnotator && ctx.task.status !== "finalized" && ctx.project.status === "active" && (!latest || sentBack);
  const visible = annotations.filter((a) => a.status !== "draft");
  const finalLabels = d.adjudication;

  return (
    <>
      {header}
      {canStart && (
        <Notice tone={sentBack ? "warn" : "info"} title={sentBack ? "Changes requested" : "Ready to label"}>
          {sentBack && latest?.review && <p className="mb-2 whitespace-pre-wrap"><strong>{latest.review.reviewer_name}:</strong> {latest.review.comments}</p>}
          <ActionForm action={startAnnotationAction}>
            <input type="hidden" name="task_id" value={taskId} />
            <SubmitButton pendingLabel="Opening…">{sentBack ? `Start revision ${latest!.revision + 1}` : "Start labeling"}</SubmitButton>
          </ActionForm>
          {sentBack && <p className="mt-2 text-xs text-ink-2">Your submitted revision stays unchanged; the new revision is pre-filled from it and linked to it.</p>}
        </Notice>
      )}
      {isAnnotator && latest?.status === "submitted" && !sentBack && (
        <Notice tone="ok" title={latest.review?.decision === "approve" ? "Approved" : "Submitted: awaiting independent review"}>
          Your revision {latest.revision} is locked. {next && next.id !== taskId ? <Link href={`/label/${next.id}`} className="font-medium text-brand underline">Go to your next task →</Link> : "No more open tasks in your queue."}
        </Notice>
      )}
      {!isAnnotator && !can(roles, "manage_project") && !roles.some((r) => ["reviewer", "adjudicator", "viewer"].includes(r)) && <Notice tone="warn">You are not assigned to this task.</Notice>}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.05fr)]">
        {casePane}
        <Card className="xl:self-start">
          <CardHeader title="Model response" subtitle={responseMeta} />
          <div className="p-4">
            <ResponseText text={ctx.response.response_text} spans={(latest ?? visible[0])?.evidence.map((e) => ({ start: e.response_start_offset, end: e.response_end_offset, label: e.issue_category })) ?? []} />
            <p className="mt-3 text-xs text-ink-2">Recorded {formatDate(ctx.response.created_at)}. Untrusted example answer; not a clinical recommendation.</p>
          </div>
        </Card>
        <div className="space-y-4">
          {finalLabels && (
            <Card>
              <CardHeader title="Adjudicated final label" subtitle={`by ${finalLabels.adjudicator_name} · ${formatDate(finalLabels.created_at)}`} />
              <div className="space-y-2 p-4 text-sm">
                <p><strong>Final verdict:</strong> {humanize(String(finalLabels.final_labels_json.verdict))} · <strong>severity:</strong> {humanize(String(finalLabels.final_labels_json.safety_severity))}</p>
                <p className="whitespace-pre-wrap"><strong>Reconciliation note:</strong> {finalLabels.reason}</p>
                <p className="text-xs text-ink-2">Both independent annotations below are preserved unchanged.</p>
              </div>
            </Card>
          )}
          {visible.length === 0 ? (
            <Card className="p-4"><EmptyState title="No submitted annotations visible">{ctx.project.blind_annotation ? "Blind mode: annotators only see their own work; other roles see submissions once made." : "Nothing submitted yet."}</EmptyState></Card>
          ) : visible.map((a) => (
            <Card key={a.id} className="p-4"><AnnotationView a={a} taxonomy={defs.taxonomy} rubric={defs.rubric} /></Card>
          ))}
          {roles.includes("reviewer") && visible.some((a) => a.status === "submitted" && !a.review && a.annotator_id !== actor.id) && <ButtonLink href="/review" variant="primary">Go to review queue</ButtonLink>}
          {roles.includes("adjudicator") && ctx.task.status === "adjudication" && <ButtonLink href={`/adjudication/${taskId}`} variant="primary">Adjudicate this task</ButtonLink>}
        </div>
      </div>
    </>
  );
}
