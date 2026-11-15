import type { Metadata } from "next";
import { updateProjectAction } from "@/app/actions/projects";
import { ProjectForm } from "@/components/workflows/project-form";
import { Card, Notice, PageHeader } from "@/components/ui/primitives";
import { can } from "@/lib/permissions/roles";
import { pageQuery } from "@/lib/server/context";
import { getProject, listDefinitionVersions, versionsLocked } from "@/lib/services/projects";

export const metadata: Metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const d = await pageQuery(async (tx, actor) => ({
    ...(await getProject(tx, actor, projectId)),
    ...(await listDefinitionVersions(tx)),
    locked: await versionsLocked(tx, projectId),
  }));
  const p = d.project;
  return (
    <>
      <PageHeader title={`Edit: ${p.name}`} description="Changes are recorded in the audit log. Existing tasks keep their own annotation requirements." />
      {!can(d.roles, "manage_project") ? <Notice tone="warn">Only project owners/admins can edit a project.</Notice>
        : p.status !== "active" ? <Notice tone="info">Restore this project before editing it.</Notice>
        : <Card className="max-w-3xl p-5"><ProjectForm action={updateProjectAction} taxonomies={d.taxonomies} rubrics={d.rubrics} versionsLocked={d.locked} submitLabel="Save changes" defaults={p} /></Card>}
    </>
  );
}
