import type { Metadata } from "next";
import { AdjudicationEditor } from "@/components/annotations/adjudication-editor";
import { AnnotationView } from "@/components/annotations/annotation-view";
import { ResponseText } from "@/components/annotations/response-text";
import { CaseSummary } from "@/components/clinical/case-summary";
import { Card, CardHeader, DemoBadge, Notice, PageHeader } from "@/components/ui/primitives";
import { TaskStatusChip } from "@/components/ui/status";
import { pageQuery } from "@/lib/server/context";
import { listTaskAnnotations } from "@/lib/services/annotations";
import { getProjectRoles, loadDefinitions } from "@/lib/services/core";
import { getTaskContext } from "@/lib/services/tasks";

export const metadata: Metadata = { title: "Adjudicate" };

export default async function AdjudicatePage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const d = await pageQuery(async (tx, actor) => {
    const ctx = await getTaskContext(tx, taskId);
    return {
      ctx, actor,
      roles: await getProjectRoles(tx, ctx.task.project_id, actor.id),
      annotations: (await listTaskAnnotations(tx, taskId)).filter((a) => a.status === "submitted" && a.review?.decision === "approve"),
      defs: await loadDefinitions(tx, ctx.project.taxonomy_version_id, ctx.project.rubric_version_id),
    };
  });
  const { ctx, annotations, defs } = d;
  const [a, b] = annotations;
  const diff = new Set<string>();
  if (a && b) {
    const la = a.labels_json, lb = b.labels_json;
    if (la.verdict !== lb.verdict) diff.add("verdict");
    if (la.safety_severity !== lb.safety_severity) diff.add("safety_severity");
    if (la.task_type !== lb.task_type) diff.add("task_type");
    if ([...(la.findings ?? [])].sort().join() !== [...(lb.findings ?? [])].sort().join()) diff.add("findings");
    if (JSON.stringify(la.rubric_scores) !== JSON.stringify(lb.rubric_scores)) diff.add("rubric_scores");
    if (a.confidence !== b.confidence) diff.add("confidence");
  }
  const canAdjudicate = d.roles.includes("adjudicator") && ctx.task.status === "adjudication" && !annotations.some((x) => x.annotator_id === d.actor.id);
  const rubricDeltas = a && b ? defs.rubric.dimensions.map((dim) => {
    const x = a.labels_json.rubric_scores?.[dim.key], y = b.labels_json.rubric_scores?.[dim.key];
    return { label: dim.label, x, y, delta: typeof x === "number" && typeof y === "number" ? y - x : null };
  }) : [];

  return (
    <>
      <PageHeader title="Adjudicate disagreement" description={<>{ctx.caseRow.title} {ctx.caseRow.is_demo && <DemoBadge />} · {ctx.project.name}</>} actions={<TaskStatusChip status={ctx.task.status} />} />
      {!canAdjudicate && <div className="mb-4"><Notice tone="info">{ctx.task.status !== "adjudication" ? "This task is not awaiting adjudication." : "Only an adjudicator who did not annotate this task can finalize it."}</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Case & prompt" /><div className="space-y-3 p-4"><CaseSummary scenario={ctx.caseRow.scenario} compact /><p className="whitespace-pre-wrap rounded-lg bg-canvas p-3 text-sm">{ctx.prompt.prompt_text}</p></div></Card>
        <Card><CardHeader title="Model response" subtitle="Evidence from both annotators highlighted" /><div className="p-4"><ResponseText text={ctx.response.response_text} spans={annotations.flatMap((x) => x.evidence.map((e) => ({ start: e.response_start_offset, end: e.response_end_offset, label: `${x.annotator_name}: ${e.issue_category ?? ""}` })))} /></div></Card>
      </div>
      <h2 className="mb-2 mt-6 text-lg font-semibold">Independent annotations <span className="text-sm font-normal text-ink-2">(differences highlighted)</span></h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {annotations.map((x) => <Card key={x.id} className="p-4"><AnnotationView a={x} taxonomy={defs.taxonomy} rubric={defs.rubric} highlight={diff} /></Card>)}
      </div>
      {rubricDeltas.length > 0 && (
        <Card className="mt-4 overflow-x-auto">
          <CardHeader title="Rubric deltas" subtitle={`${b?.annotator_name} minus ${a?.annotator_name}`} />
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-xs text-ink-2"><tr><th className="px-4 py-1.5 font-medium">Dimension</th><th className="px-2 font-medium">{a?.annotator_name}</th><th className="px-2 font-medium">{b?.annotator_name}</th><th className="px-2 font-medium">Δ</th></tr></thead>
            <tbody className="divide-y divide-line">{rubricDeltas.map((r) => <tr key={r.label}><td className="px-4 py-1.5">{r.label}</td><td className="px-2 tabular-nums">{String(r.x ?? "—")}</td><td className="px-2 tabular-nums">{String(r.y ?? "—")}</td><td className={`px-2 tabular-nums ${r.delta ? "font-semibold text-warn" : ""}`}>{r.delta === null ? "—" : r.delta > 0 ? `+${r.delta}` : r.delta}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
      {canAdjudicate && (
        <Card className="mt-4">
          <CardHeader title="Final label" subtitle="Creates an immutable adjudication record referencing both annotations." />
          <div className="p-4">
            <AdjudicationEditor taskId={taskId} taxonomy={defs.taxonomy} rubric={defs.rubric}
              sources={annotations.map((x) => ({ id: x.id, name: x.annotator_name, labels: x.labels_json as Record<string, unknown>, rationale: x.rationale, confidence: x.confidence }))} />
          </div>
        </Card>
      )}
    </>
  );
}
