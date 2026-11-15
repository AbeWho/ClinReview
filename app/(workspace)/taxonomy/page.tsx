import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { Badge, Card, CardHeader, formatDate, PageHeader } from "@/components/ui/primitives";
import { pageQuery } from "@/lib/server/context";
import { RubricDefinitionSchema, TaxonomyDefinitionSchema } from "@/lib/taxonomy/schema";

export const metadata: Metadata = { title: "Taxonomy & Rubric" };

export default async function TaxonomyPage() {
  const d = await pageQuery(async (tx) => ({
    tax: await tx.query<{ id: string; name: string; version: string; definitions_json: unknown; published_at: Date | null }>("select id, name, version, definitions_json, published_at from taxonomy_versions order by name, version desc"),
    rub: await tx.query<{ id: string; name: string; version: string; definitions_json: unknown; published_at: Date | null }>("select id, name, version, definitions_json, published_at from rubric_versions order by name, version desc"),
  }));
  return (
    <>
      <PageHeader title="Taxonomy & Rubric" icon={<BookOpen className="size-6" />} description="Versioned label definitions. Published versions are immutable (database-enforced); every annotation and export pins the exact version it used. Creating new versions from the UI is a planned feature." />
      {d.tax.map((t) => {
        const def = TaxonomyDefinitionSchema.parse(t.definitions_json);
        return (
          <Card key={t.id} className="mb-5">
            <CardHeader title={`${t.name} v${t.version}`} subtitle={t.published_at ? `Published ${formatDate(t.published_at)} · immutable` : "Draft"} actions={<Badge tone="brand">Taxonomy</Badge>} />
            <div className="grid gap-5 p-4 lg:grid-cols-2">
              <section><h3 className="mb-2 font-semibold">Severity (plausible patient impact)</h3>
                <dl className="space-y-1.5 text-sm">{def.severities.map((s) => <div key={s.key}><dt className="font-medium">{s.label}</dt><dd className="text-ink-2">{s.criteria}</dd></div>)}</dl></section>
              <section><h3 className="mb-2 font-semibold">Verdicts</h3>
                <dl className="space-y-1.5 text-sm">{def.verdicts.map((s) => <div key={s.key}><dt className="font-medium">{s.label}</dt><dd className="text-ink-2">{s.definition}</dd></div>)}</dl>
                <h3 className="mb-2 mt-4 font-semibold">Clinical task types</h3>
                <ul className="flex flex-wrap gap-1">{def.task_types.map((s) => <li key={s.key}><Badge>{s.label}</Badge></li>)}</ul></section>
              <section className="lg:col-span-2"><h3 className="mb-2 font-semibold">Finding labels</h3>
                <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm">
                  <thead className="bg-canvas text-left text-xs text-ink-2"><tr><th className="px-2 py-1.5 font-medium">Label</th><th className="px-2 font-medium">Definition</th><th className="px-2 font-medium">Example</th><th className="px-2 font-medium">Not this</th><th className="px-2 font-medium">Decision rule</th></tr></thead>
                  <tbody className="divide-y divide-line align-top">{def.findings.map((f) => <tr key={f.key}><td className="px-2 py-2 font-medium">{f.label}</td><td className="px-2 py-2">{f.definition}</td><td className="px-2 py-2 text-ink-2">{f.example}</td><td className="px-2 py-2 text-ink-2">{f.non_example}</td><td className="px-2 py-2">{f.decision_rule}</td></tr>)}</tbody>
                </table></div></section>
            </div>
          </Card>
        );
      })}
      {d.rub.map((r) => {
        const def = RubricDefinitionSchema.parse(r.definitions_json);
        return (
          <Card key={r.id}>
            <CardHeader title={`${r.name} v${r.version}`} subtitle="Scores 1–5 with anchors. No overall score: no documented aggregation formula." actions={<Badge tone="brand">Rubric</Badge>} />
            <div className="overflow-x-auto p-4"><table className="w-full min-w-[800px] text-sm">
              <thead className="bg-canvas text-left text-xs text-ink-2"><tr><th className="px-2 py-1.5 font-medium">Dimension</th>{[1, 2, 3, 4, 5].map((n) => <th key={n} className="px-2 font-medium">{n}</th>)}<th className="px-2 font-medium">N/A?</th></tr></thead>
              <tbody className="divide-y divide-line align-top">{def.dimensions.map((dm) => <tr key={dm.key}><td className="px-2 py-2"><p className="font-medium">{dm.label}</p><p className="text-xs text-ink-2">{dm.definition}</p></td>{(["1", "2", "3", "4", "5"] as const).map((n) => <td key={n} className="px-2 py-2 text-ink-2">{dm.anchors[n]}</td>)}<td className="px-2 py-2">{dm.allow_na ? "Allowed" : "No"}</td></tr>)}</tbody>
            </table></div>
          </Card>
        );
      })}
    </>
  );
}
