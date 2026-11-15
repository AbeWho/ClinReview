import type { Metadata } from "next";
import Link from "next/link";
import { PencilLine } from "lucide-react";
import { WorkflowStepper } from "@/components/workflows/workflow-stepper";
import { Badge, Card, CardHeader, EmptyState, formatDate, PageHeader } from "@/components/ui/primitives";
import { PROMPT_TEMPLATES } from "@/lib/prompts/templates";
import { pageQuery } from "@/lib/server/context";
import { listPrompts } from "@/lib/services/prompts";

export const metadata: Metadata = { title: "Prompt Builder" };

export default async function PromptsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const prompts = await pageQuery((tx) => listPrompts(tx));
  return (
    <>
      <PageHeader title="Prompt Builder" icon={<PencilLine className="size-6" />} description="Prompts are built from a case and saved as immutable versions. Open a case to edit its prompt." />
      <WorkflowStepper current="prompt" projectId={project} />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-x-auto">
          <CardHeader title="Prompts" />
          {prompts.length === 0 ? <div className="p-4"><EmptyState title="No prompts yet">Open a case and save a prompt version.</EmptyState></div> : (
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-canvas text-left text-xs text-ink-2"><tr><th className="px-4 py-2 font-medium">Case</th><th className="px-2 py-2 font-medium">Current version</th><th className="px-2 py-2 font-medium">Tags</th><th className="px-2 py-2 font-medium">Updated</th></tr></thead>
              <tbody className="divide-y divide-line">
                {prompts.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5"><Link className="font-medium hover:text-brand" href={`/cases/${p.case_id}`}>{p.case_title}</Link><p className="text-xs text-ink-2">{p.project_name}</p></td>
                    <td className="px-2 py-2.5">v{p.version_number ?? "—"} <span className="text-xs text-ink-2">({p.version_count} total)</span></td>
                    <td className="px-2 py-2.5"><div className="flex flex-wrap gap-1">{p.tags.map((t) => <Badge key={t} tone="brand">{t}</Badge>)}</div></td>
                    <td className="px-2 py-2.5 text-ink-2">{formatDate(p.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card>
          <CardHeader title="Scenario templates" subtitle="Reusable; variables fill from the structured case" />
          <ul className="divide-y divide-line">
            {PROMPT_TEMPLATES.map((t) => (
              <li key={t.key} className="px-4 py-3">
                <p className="text-sm font-medium">{t.label}</p>
                <p className="mt-1 line-clamp-3 font-mono text-xs text-ink-2">{t.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
