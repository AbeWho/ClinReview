import type { Metadata } from "next";
import { CaseForm } from "@/components/clinical/case-form";
import { ButtonLink, Card, Notice, PageHeader } from "@/components/ui/primitives";
import { can } from "@/lib/permissions/roles";
import { pageQuery } from "@/lib/server/context";
import { getCase } from "@/lib/services/cases";
import { getProjectRoles } from "@/lib/services/core";

export const metadata: Metadata = { title: "Edit case" };

export default async function EditCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const d = await pageQuery(async (tx, actor) => {
    const c = await getCase(tx, caseId);
    return { c, roles: await getProjectRoles(tx, c.project_id, actor.id) };
  });
  const { c } = d;
  const blocked = !can(d.roles, "author_content") ? "Only project owners/admins can edit cases."
    : c.prompt_count > 0 ? "This case already has a prompt, so it is frozen. Every prompt version and model response must keep pointing at the exact scenario it was written for. Create a new case instead."
    : null;
  return (
    <>
      <PageHeader title={`Edit case: ${c.title}`} description="Cases can be edited until a prompt is built from them. The change is audited and the duplicate check runs again." />
      {blocked ? <><Notice tone="info">{blocked}</Notice><ButtonLink href={`/cases/${c.id}`} className="mt-4">Back to case</ButtonLink></> : (
        <Card className="max-w-4xl p-5">
          <CaseForm projects={[]} initial={{ caseId: c.id, projectId: c.project_id, title: c.title, scenario: c.scenario_json, sourceNotes: c.source_notes, sourceType: c.source_type }} />
        </Card>
      )}
    </>
  );
}
