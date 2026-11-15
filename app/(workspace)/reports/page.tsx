import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { BarList } from "@/components/workflows/bar-list";
import { buttonClasses, Card, CardHeader, DemoBadge, EmptyState, inputClasses, Notice, PageHeader, Stat } from "@/components/ui/primitives";
import { pageQuery } from "@/lib/server/context";
import { loadDefinitions } from "@/lib/services/core";
import { listProjects } from "@/lib/services/projects";
import { projectReport } from "@/lib/services/reports";
import { STATUS_LABELS, TASK_STATUSES } from "@/lib/workflow/task-status";

export const metadata: Metadata = { title: "Reports" };

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const num = (v: number | null, d = 2) => (v === null ? "—" : v.toFixed(d));

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const sp = await searchParams;
  const d = await pageQuery(async (tx, actor) => {
    const projects = await listProjects(tx, { includeArchived: true });
    const project = projects.find((p) => p.id === sp.project) ?? projects[0];
    if (!project) return null;
    return { projects, project, report: await projectReport(tx, actor, project.id), defs: await loadDefinitions(tx, project.taxonomy_version_id, project.rubric_version_id) };
  });
  if (!d) return <EmptyState title="No projects" />;
  const { report: r, project, defs } = d;
  const lbl = (list: { key: string; label: string }[]) => Object.fromEntries(list.map((x) => [x.key, x.label]));

  return (
    <>
      <PageHeader title="Reports" icon={<BarChart3 className="size-6" />} description="Every figure is computed live from the records you can access. Agreement shows its sample size; high agreement alone does not prove medical accuracy."
        actions={project.is_demo ? <DemoBadge /> : undefined} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-ink-2">Project
          <select name="project" defaultValue={project.id} className={`${inputClasses} mt-0.5 w-auto min-w-[260px]`}>{d.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <button className={buttonClasses("secondary")} type="submit">Switch</button>
      </form>
      {project.is_demo && <div className="mb-4"><Notice tone="info">Seeded demo project: these numbers describe a handful of fictional demo records, not real annotation work.</Notice></div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Completion" value={`${r.finalizedCount} / ${r.totalTasks}`} hint={r.totalTasks ? `${Math.round((r.finalizedCount / r.totalTasks) * 100)}% of tasks finalized` : "no tasks"} />
        <Stat label="Verdict agreement" value={pct(r.verdictAgreement.percentAgreement)} hint={`Cohen's κ ${num(r.verdictAgreement.cohensKappa)} · n = ${r.verdictAgreement.n} pair(s)`} />
        <Stat label="Median review turnaround" value={r.reviewTurnaroundMedianHours === null ? "—" : `${r.reviewTurnaroundMedianHours.toFixed(1)} h`} hint={`${r.reviewCount} review(s), submit → decision`} />
        <Stat label="Export ready" value={r.exportReadiness.eligible} hint={`${r.exportReadiness.excluded} excluded`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card><CardHeader title="Items by workflow state" /><div className="p-4">
          <BarList title="Tasks" data={r.byStatus} order={[...TASK_STATUSES]} labels={STATUS_LABELS} />
        </div></Card>
        <Card><CardHeader title="Final verdicts" subtitle="Finalized tasks only" /><div className="space-y-5 p-4">
          <BarList title="Verdict" data={r.verdicts} order={defs.taxonomy.verdicts.map((v) => v.key)} labels={lbl(defs.taxonomy.verdicts)} />
          <BarList title="Finalized via" data={r.finalizedVia} order={["review", "consensus", "adjudication"]} />
        </div></Card>
        <Card><CardHeader title="Safety" subtitle="Finalized tasks only" /><div className="space-y-5 p-4">
          <BarList title="Severity" data={r.severities} order={defs.taxonomy.severities.map((s) => s.key)} labels={lbl(defs.taxonomy.severities)} />
          <BarList title="Issue labels (multi-label; one task can have several)" data={r.findings} labels={lbl(defs.taxonomy.findings)} total={Object.values(r.findings).reduce((a, b) => a + b, 0)} />
        </div></Card>
        <Card><CardHeader title="Review & agreement" /><div className="space-y-5 p-4">
          <BarList title="Review decisions (per annotation revision)" data={r.reviewDecisions} order={["approve", "needs_changes", "reject"]} labels={{ approve: "Approved", needs_changes: "Changes requested", reject: "Rejected" }} />
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <dt className="text-ink-2">Severity agreement</dt><dd className="tabular-nums">{pct(r.severityAgreement.percentAgreement)} (κ {num(r.severityAgreement.cohensKappa)}, n = {r.severityAgreement.n})</dd>
          </dl>
          <p className="text-xs text-ink-2">Agreement is computed over tasks with two approved independent annotations, comparing their verdicts/severities. κ (Cohen&apos;s kappa) corrects for chance and is unstable at small n; it is shown as “—” when undefined.</p>
          {Object.keys(r.exportReadiness.reasons).length > 0 && (
            <div><p className="text-sm font-medium">Export exclusions</p>
              <ul className="mt-1 text-sm">{Object.entries(r.exportReadiness.reasons).map(([k, v]) => <li key={k} className="flex justify-between gap-3"><span className="text-ink-2">{k}</span><span className="tabular-nums">{v}</span></li>)}</ul></div>
          )}
        </div></Card>
      </div>
    </>
  );
}
