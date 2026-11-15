import type { Metadata } from "next";
import { CaseForm } from "@/components/clinical/case-form";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { pageQuery } from "@/lib/server/context";

export const metadata: Metadata = { title: "New synthetic case" };

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const projects = await pageQuery(async (tx, actor) => tx.query<{ id: string; name: string }>(
    `select p.id, p.name from projects p where p.status = 'active'
       and exists (select 1 from project_members m where m.project_id = p.id and m.user_id = $1 and m.role in ('owner','admin')) order by p.name`, [actor.id]));
  return (
    <>
      <PageHeader title="New synthetic case" description="Structured fields keep cases comparable and machine-readable. Exact duplicates within a project are rejected." />
      {projects.length ? <Card className="max-w-4xl p-5"><CaseForm projects={projects} defaultProjectId={project} /></Card>
        : <EmptyState title="No project you can author in">Only project owners/admins can add cases. Sign in as Demo Project Lead, or create your own project.</EmptyState>}
    </>
  );
}
