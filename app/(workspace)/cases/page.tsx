import type { Metadata } from "next";
import Link from "next/link";
import { Database, Plus, Upload } from "lucide-react";
import { WorkflowStepper } from "@/components/workflows/workflow-stepper";
import { ButtonLink, Card, DemoBadge, EmptyState, formatDate, humanize, PageHeader } from "@/components/ui/primitives";
import { pageQuery } from "@/lib/server/context";
import { listCases } from "@/lib/services/cases";

export const metadata: Metadata = { title: "Case Intake" };

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const cases = await pageQuery((tx) => listCases(tx, project));
  return (
    <>
      <PageHeader title="Case Intake" icon={<Database className="size-6" />} description="Fully synthetic clinical scenarios with source and provenance. Add one at a time or import a validated CSV/JSONL file."
        actions={<>
          <ButtonLink href={`/cases/import${project ? `?project=${project}` : ""}`}><Upload className="size-4" aria-hidden /> Import CSV / JSONL</ButtonLink>
          <ButtonLink href={`/cases/new${project ? `?project=${project}` : ""}`} variant="primary"><Plus className="size-4" aria-hidden /> New synthetic case</ButtonLink>
        </>} />
      <WorkflowStepper current="intake" projectId={project} />
      {cases.length === 0 ? <EmptyState title="No cases yet" /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Synthetic cases</caption>
            <thead className="bg-canvas text-left text-xs text-ink-2"><tr><th className="px-4 py-2 font-medium">Case</th><th className="px-2 py-2 font-medium">Project</th><th className="px-2 py-2 font-medium">Classification / source</th><th className="px-2 py-2 font-medium">Prompts / responses</th><th className="px-2 py-2 font-medium">Created</th></tr></thead>
            <tbody className="divide-y divide-line">
              {cases.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5"><Link href={`/cases/${c.id}`} className="font-medium hover:text-brand">{c.title}</Link> {c.is_demo && <DemoBadge />}<p className="text-xs text-ink-2">{c.scenario_json.chief_complaint}</p></td>
                  <td className="px-2 py-2.5 text-ink-2">{c.project_name}</td>
                  <td className="px-2 py-2.5 text-ink-2">{humanize(c.data_classification)} · {humanize(c.source_type)}</td>
                  <td className="px-2 py-2.5 tabular-nums">{c.prompt_count} / {c.response_count}</td>
                  <td className="px-2 py-2.5 text-ink-2">{formatDate(c.created_at, false)} · {c.created_by_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
