import type { Metadata } from "next";
import { CheckCircle2, Download, XCircle } from "lucide-react";
import { createExportAction } from "@/app/actions/exports";
import { WorkflowStepper } from "@/components/workflows/workflow-stepper";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses, Card, CardHeader, DemoBadge, EmptyState, Field, formatDate, inputClasses, Notice, PageHeader } from "@/components/ui/primitives";
import { TaskStatusChip } from "@/components/ui/status";
import { CSV_LOSS_NOTE, EXPORT_SCHEMA_VERSION } from "@/lib/exports/schema";
import { SPLIT_ALGORITHM } from "@/lib/exports/split";
import { can } from "@/lib/permissions/roles";
import { pageQuery } from "@/lib/server/context";
import { getProjectRoles } from "@/lib/services/core";
import { computeEligibility, listExports } from "@/lib/services/exports";
import { listProjects } from "@/lib/services/projects";

export const metadata: Metadata = { title: "Exports" };

export default async function ExportsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const sp = await searchParams;
  const d = await pageQuery(async (tx, actor) => {
    const projects = await listProjects(tx, { includeArchived: true });
    const project = projects.find((p) => p.id === sp.project) ?? projects[0];
    if (!project) return { projects, project: null };
    return {
      projects, project,
      roles: await getProjectRoles(tx, project.id, actor.id),
      eligibility: await computeEligibility(tx, actor, project.id),
      exports: await listExports(tx, project.id),
    };
  });
  if (!d.project) return <EmptyState title="No projects" />;
  const { project, eligibility, exports } = d as Required<typeof d>;
  const canExport = can(d.roles!, "export");

  return (
    <>
      <PageHeader title="Exports" icon={<Download className="size-6" />} description="Versioned, validated, immutable dataset releases. Only finalized records that pass schema validation are included."
        actions={project.is_demo ? <DemoBadge /> : undefined} />
      <WorkflowStepper current="export" projectId={project.id} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-ink-2">Project
          <select name="project" defaultValue={project.id} className={`${inputClasses} mt-0.5 w-auto min-w-[260px]`}>{d.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <button className={buttonClasses("secondary")} type="submit">Switch</button>
      </form>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Export readiness" subtitle={`${eligibility.eligibleCount} eligible · ${eligibility.excludedCount} excluded`} />
          {Object.keys(eligibility.reasonCounts).length > 0 && (
            <div className="border-b border-line px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Exclusions by reason</p>
              <ul className="mt-1 space-y-0.5 text-sm">{Object.entries(eligibility.reasonCounts).map(([r, n]) => <li key={r} className="flex justify-between gap-3"><span>{r}</span><span className="tabular-nums">{n}</span></li>)}</ul>
            </div>
          )}
          {eligibility.items.length === 0 ? <div className="p-4"><EmptyState title="No tasks in this project" /></div> : (
            <ul className="divide-y divide-line">
              {eligibility.items.map((i) => (
                <li key={i.task_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {i.eligible ? <CheckCircle2 className="size-4 shrink-0 text-ok" aria-hidden /> : <XCircle className="size-4 shrink-0 text-ink-2" aria-hidden />}
                    <span className="truncate">{i.case_title}</span><span className="sr-only">{i.eligible ? "eligible" : "excluded"}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-ink-2">{i.reason}<TaskStatusChip status={i.status} /></span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          {canExport && project.status === "active" ? (
            <Card>
              <CardHeader title="Create export version" subtitle={`Schema v${EXPORT_SCHEMA_VERSION}`} />
              <ActionForm action={createExportAction} className="space-y-3 p-4">
                <input type="hidden" name="project_id" value={project.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Semantic version" htmlFor="semantic_version" hint="Blank = next minor version"><input id="semantic_version" name="semantic_version" placeholder="auto" className={inputClasses} /></Field>
                  <Field label="Split seed" htmlFor="split_seed" required hint="Same seed + same data = same splits"><input id="split_seed" name="split_seed" defaultValue="clinreview-v1" required className={inputClasses} /></Field>
                </div>
                <Field label="Release notes" htmlFor="notes"><textarea id="notes" name="notes" rows={2} className={inputClasses} /></Field>
                <p className="text-xs text-ink-2">Split: {SPLIT_ALGORITHM}. Grouped by case group so related variants never leak across splits.</p>
                <SubmitButton pendingLabel="Validating & writing…">Generate export ({eligibility.eligibleCount} records)</SubmitButton>
              </ActionForm>
            </Card>
          ) : <Notice tone="info">Only project owners/admins can create exports{project.status !== "active" ? " (project is archived)" : ""}. Any member can download existing versions.</Notice>}

          <Card>
            <CardHeader title="Version history" />
            {exports.length === 0 ? <p className="p-4 text-sm text-ink-2">No exports yet.</p> : (
              <ul className="divide-y divide-line">
                {exports.map((e) => {
                  const splits = (e.manifest_json.split as { counts: Record<string, number> }).counts;
                  return (
                    <li key={e.id} className="space-y-1.5 px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">v{e.semantic_version}</span><span className="text-xs text-ink-2">{formatDate(e.created_at)} · {e.created_by_name}</span></div>
                      <p className="text-xs text-ink-2">{e.record_count} records ({e.excluded_count} excluded) · train {splits.train} / val {splits.validation} / test {splits.test} · seed <code>{e.split_seed}</code></p>
                      <p className="break-all text-xs text-ink-2">sha256 <code>{e.content_hash}</code></p>
                      <div className="flex flex-wrap gap-2">
                        <a className={buttonClasses("primary", "sm")} href={`/api/exports/${e.id}/jsonl`}>JSONL</a>
                        <a className={buttonClasses("secondary", "sm")} href={`/api/exports/${e.id}/csv`}>CSV</a>
                        <a className={buttonClasses("secondary", "sm")} href={`/api/exports/${e.id}/manifest`}>Manifest</a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="border-t border-line px-4 py-2 text-xs text-ink-2">{CSV_LOSS_NOTE}</p>
          </Card>
        </div>
      </div>
    </>
  );
}
