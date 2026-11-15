import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { ImportForm } from "@/components/clinical/import-form";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { CSV_COLUMNS } from "@/lib/imports/case-import";
import { pageQuery } from "@/lib/server/context";

export const metadata: Metadata = { title: "Import cases" };

export default async function ImportCasesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const projects = await pageQuery((tx, actor) => tx.query<{ id: string; name: string }>(
    `select p.id, p.name from projects p where p.status = 'active'
       and exists (select 1 from project_members m where m.project_id = p.id and m.user_id = $1 and m.role in ('owner','admin')) order by p.name`, [actor.id]));
  return (
    <>
      <PageHeader title="Import synthetic cases" icon={<Upload className="size-6" />} description="Upload a CSV or JSONL file, review a dry-run preview with per-row errors, then import the valid rows in one transaction." />
      {!projects.length ? <EmptyState title="No project you can author in">Only project owners/admins can import cases.</EmptyState> : (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <Card className="p-5"><ImportForm projects={projects} defaultProjectId={project} /></Card>
          <Card>
            <CardHeader title="File format" />
            <div className="space-y-3 p-4 text-sm">
              <p>Templates: <a className="text-brand underline" href="/templates/case-import-template.csv" download>CSV</a> · <a className="text-brand underline" href="/templates/case-import-template.jsonl" download>JSONL</a></p>
              <p><strong>CSV columns</strong> (header row required; <em>title, age_band, sex, chief_complaint, hpi, source_notes</em> required):</p>
              <p className="break-words font-mono text-xs text-ink-2">{CSV_COLUMNS.join(", ")}</p>
              <p>List fields (comorbidities, medications, allergies, labs) are separated with <code>;</code>. Use quotes for text containing commas.</p>
              <p><strong>JSONL:</strong> one JSON object per line with <code>title</code>, <code>scenario</code>, <code>source_notes</code>, optional <code>case_group_key</code>.</p>
              <p><strong>case_group_key:</strong> rows sharing a key are variants of one scenario and always land in the same train/validation/test split.</p>
              <p className="text-xs text-ink-2">Limits: 1 MB, 200 rows, UTF-8. Exact duplicates (within the file or already in the project) are skipped.</p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
