import type { Metadata } from "next";
import { submitReviewAction } from "@/app/actions/reviews";
import { AnnotationView } from "@/components/annotations/annotation-view";
import { ResponseText } from "@/components/annotations/response-text";
import { CaseSummary } from "@/components/clinical/case-summary";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardHeader, DemoBadge, Field, inputClasses, Notice, PageHeader } from "@/components/ui/primitives";
import { pageQuery } from "@/lib/server/context";
import { getAnnotation, listTaskAnnotations } from "@/lib/services/annotations";
import { getProjectRoles, loadDefinitions } from "@/lib/services/core";
import { getTaskContext } from "@/lib/services/tasks";
import { REVIEW_CHECKLIST } from "@/lib/validation/forms";

export const metadata: Metadata = { title: "Review annotation" };

export default async function ReviewAnnotationPage({ params }: { params: Promise<{ annotationId: string }> }) {
  const { annotationId } = await params;
  const d = await pageQuery(async (tx, actor) => {
    const a = await getAnnotation(tx, annotationId);
    const ctx = await getTaskContext(tx, a.task_id);
    return {
      a, ctx, actor,
      roles: await getProjectRoles(tx, a.project_id, actor.id),
      history: (await listTaskAnnotations(tx, a.task_id)).filter((x) => x.annotator_id === a.annotator_id && x.id !== a.id),
      defs: await loadDefinitions(tx, a.taxonomy_version_id, a.rubric_version_id),
    };
  });
  const { a, ctx, defs } = d;
  const own = a.annotator_id === d.actor.id;
  const reviewable = d.roles.includes("reviewer") && !own && a.status === "submitted" && !a.review;

  return (
    <>
      <PageHeader title="Review annotation" description={<>{ctx.caseRow.title} {ctx.caseRow.is_demo && <DemoBadge />} · {ctx.project.name}</>} />
      {own && <div className="mb-4"><Notice tone="danger" title="Independent review">You cannot review your own annotation.</Notice></div>}
      {!reviewable && !own && <div className="mb-4"><Notice tone="info">This annotation is not awaiting your review{a.review ? " (already reviewed)" : ""}.</Notice></div>}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:self-start">
          <CardHeader title="Case & prompt" />
          <div className="space-y-3 p-4">
            <CaseSummary scenario={ctx.caseRow.scenario} compact />
            <p className="whitespace-pre-wrap rounded-lg bg-canvas p-3 text-sm">{ctx.prompt.prompt_text}</p>
          </div>
        </Card>
        <Card className="xl:self-start">
          <CardHeader title="Model response" subtitle={`${ctx.response.model_name} · evidence highlighted`} />
          <div className="p-4"><ResponseText text={ctx.response.response_text} spans={a.evidence.map((e) => ({ start: e.response_start_offset, end: e.response_end_offset, label: e.issue_category }))} /></div>
        </Card>
        <div className="space-y-4">
          <Card className="p-4"><AnnotationView a={a} taxonomy={defs.taxonomy} rubric={defs.rubric} /></Card>
          {d.history.length > 0 && (
            <Card>
              <CardHeader title="Earlier revisions by this annotator" />
              <div className="space-y-4 p-4">{d.history.map((h) => <AnnotationView key={h.id} a={h} taxonomy={defs.taxonomy} rubric={defs.rubric} />)}</div>
            </Card>
          )}
          {reviewable && (
            <Card>
              <CardHeader title="Your review decision" subtitle="Decisions are final and audited." />
              <ActionForm action={submitReviewAction} className="space-y-4 p-4">
                <input type="hidden" name="annotation_id" value={a.id} />
                <fieldset>
                  <legend className="text-sm font-medium">Checklist</legend>
                  <div className="mt-1 space-y-1">
                    {REVIEW_CHECKLIST.map((c) => <label key={c.key} className="flex items-start gap-2 text-sm"><input type="checkbox" name={`check_${c.key}`} className="mt-0.5 size-4 accent-[var(--color-brand)]" />{c.label}</label>)}
                  </div>
                </fieldset>
                <Field label="Comments" htmlFor="comments" hint="Required for 'request changes' or 'reject'. Be specific and actionable.">
                  <textarea id="comments" name="comments" rows={4} className={inputClasses} />
                </Field>
                <p className="text-xs text-ink-2">Approving records agreement with the annotation as an educational judgment; it does not endorse the model&apos;s clinical advice.</p>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="decision" value="approve">Approve</SubmitButton>
                  <SubmitButton name="decision" value="needs_changes" variant="secondary">Request changes</SubmitButton>
                  <SubmitButton name="decision" value="reject" variant="danger">Reject</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
