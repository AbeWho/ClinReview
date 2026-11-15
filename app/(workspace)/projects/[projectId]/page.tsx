import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus, Upload } from "lucide-react";
import { addMemberAction, removeMemberAction, setArchivedAction } from "@/app/actions/projects";
import { ActivityList } from "@/components/workflows/activity-list";
import { WorkflowStepper } from "@/components/workflows/workflow-stepper";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, ButtonLink, Card, CardHeader, DemoBadge, EmptyState, formatDate, inputClasses, KeyValue, PageHeader } from "@/components/ui/primitives";
import { PriorityChip, TaskStatusChip } from "@/components/ui/status";
import { can, ROLES } from "@/lib/permissions/roles";
import { pageQuery } from "@/lib/server/context";
import { listAuditEvents } from "@/lib/services/activity";
import { listCases } from "@/lib/services/cases";
import { getProject, listMembers, listProfiles } from "@/lib/services/projects";
import { listQueue } from "@/lib/services/tasks";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const data = await pageQuery(async (tx, actor) => {
    const { project, roles } = await getProject(tx, actor, projectId);
    return {
      project, roles,
      members: await listMembers(tx, projectId),
      profiles: await listProfiles(tx),
      cases: await listCases(tx, projectId),
      tasks: await listQueue(tx, actor, { projectId }),
      events: await listAuditEvents(tx, { projectId, limit: 10 }),
      promptCount: (await tx.query<{ n: number }>("select count(*)::int as n from prompts where project_id = $1", [projectId]))[0]!.n,
    };
  });
  const { project, roles, members, profiles, cases, tasks, events } = data;
  const manage = can(roles, "manage_project");
  const count = (s: string[]) => tasks.filter((t) => s.includes(t.status)).length;

  return (
    <>
      <PageHeader title={project.name}
        description={<>{project.clinical_domain} · your role: <strong>{roles.join(", ")}</strong></>}
        actions={<>
          {project.is_demo && <DemoBadge />}
          {project.status === "archived" && <Badge>Archived (read-only)</Badge>}
          {manage && project.status === "active" && <ButtonLink href={`/projects/${project.id}/edit`}><Pencil className="size-4" aria-hidden /> Edit project</ButtonLink>}
          {manage && project.status === "active" && <ButtonLink href={`/cases/import?project=${project.id}`}><Upload className="size-4" aria-hidden /> Import cases</ButtonLink>}
          {manage && project.status === "active" && <ButtonLink href={`/cases/new?project=${project.id}`} variant="primary"><Plus className="size-4" aria-hidden /> Add synthetic case</ButtonLink>}
        </>} />
      <WorkflowStepper current="setup" projectId={project.id} counts={{
        intake: cases.length, prompt: data.promptCount, queue: count(["queued", "in_progress"]),
        review: count(["in_review", "changes_requested"]), adjudication: count(["adjudication"]), export: count(["finalized"]),
      }} />

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Cases" subtitle="Fully synthetic scenarios" actions={manage && project.status === "active" ? <ButtonLink href={`/cases/new?project=${project.id}`} size="sm">Add case</ButtonLink> : undefined} />
            {cases.length ? (
              <ul className="divide-y divide-line">
                {cases.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <Link href={`/cases/${c.id}`} className="font-medium hover:text-brand">{c.title}</Link>
                    <span className="flex items-center gap-2 text-xs text-ink-2">{c.is_demo && <DemoBadge />} {c.prompt_count} prompt · {c.response_count} response(s)</span>
                  </li>
                ))}
              </ul>
            ) : <div className="p-4"><EmptyState title="No cases yet">Add a synthetic case to begin.</EmptyState></div>}
          </Card>

          <Card>
            <CardHeader title="Tasks" subtitle="One task per model response being evaluated" actions={<ButtonLink href={`/queue?project=${project.id}`} size="sm">Open in queue</ButtonLink>} />
            {tasks.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-canvas text-left text-xs text-ink-2"><tr><th className="px-4 py-2 font-medium">Case</th><th className="px-2 py-2 font-medium">Status</th><th className="px-2 py-2 font-medium">Priority</th><th className="px-2 py-2 font-medium">Annotators</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {tasks.map((t) => (
                      <tr key={t.id}>
                        <td className="px-4 py-2"><Link className="font-medium hover:text-brand" href={`/label/${t.id}`}>{t.case_title}</Link></td>
                        <td className="px-2 py-2"><TaskStatusChip status={t.status} /></td>
                        <td className="px-2 py-2"><PriorityChip priority={t.priority} /></td>
                        <td className="px-2 py-2 text-ink-2">{t.assignees.map((a) => a.name).join(", ") || "Unassigned"} ({t.submitted_count}/{t.required_annotations} submitted)</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="p-4"><EmptyState title="No tasks yet">Attach a model response to a case prompt, then queue it.</EmptyState></div>}
          </Card>

          <Card>
            <CardHeader title="Project activity" subtitle="Audit trail" />
            <ActivityList events={events} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Configuration" />
            <div className="space-y-3 p-4">
              <KeyValue items={[
                ["Dataset goal", project.dataset_purpose],
                ["Taxonomy", <Link key="t" className="text-brand underline" href="/taxonomy">{project.taxonomy_label}</Link>],
                ["Rubric", project.rubric_label],
                ["Annotations / item", `${project.default_required_annotations} (default)`],
                ["Blind annotation", project.blind_annotation ? "On (DB-enforced)" : "Off"],
                ["Review", "Independent clinical review required for every annotation"],
                ["Data policy", "Synthetic only"],
                ["Created", formatDate(project.created_at)],
              ]} />
              {project.description && <p className="whitespace-pre-wrap border-t border-line pt-3 text-sm text-ink-2">{project.description}</p>}
              {manage && (
                <ActionForm action={setArchivedAction} confirmMessage={project.status === "active" ? "Archive this project? It becomes read-only. Nothing is deleted." : "Restore this project?"}>
                  <input type="hidden" name="project_id" value={project.id} />
                  <input type="hidden" name="archived" value={project.status === "active" ? "true" : "false"} />
                  <SubmitButton variant={project.status === "active" ? "danger" : "secondary"} size="sm">{project.status === "active" ? "Archive project" : "Restore project"}</SubmitButton>
                </ActionForm>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Members" subtitle="Roles are per project and enforced server-side" />
            <ul className="divide-y divide-line">
              {members.map((m) => (
                <li key={`${m.user_id}-${m.role}`} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="min-w-0"><span className="font-medium">{m.display_name}</span> {m.is_demo_persona && <Badge tone="violet">Simulated</Badge>}
                    <span className="block text-xs text-ink-2">{m.role}{m.credential_verified ? " · credential verified" : ""}</span></span>
                  {manage && m.role !== "owner" && (
                    <ActionForm action={removeMemberAction} confirmMessage={`Remove ${m.display_name} as ${m.role}?`}>
                      <input type="hidden" name="project_id" value={project.id} /><input type="hidden" name="user_id" value={m.user_id} /><input type="hidden" name="role" value={m.role} />
                      <SubmitButton variant="ghost" size="sm" pendingLabel="…">Remove</SubmitButton>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            {manage && (
              <ActionForm action={addMemberAction} className="border-t border-line p-4" resetOnSuccess>
                <input type="hidden" name="project_id" value={project.id} />
                <p className="mb-2 text-sm font-medium">Add member</p>
                <div className="flex flex-wrap gap-2">
                  <label className="sr-only" htmlFor="user_id">Person</label>
                  <select id="user_id" name="user_id" className={`${inputClasses} w-auto flex-1`}>{profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
                  <label className="sr-only" htmlFor="role">Role</label>
                  <select id="role" name="role" className={`${inputClasses} w-auto`}>{ROLES.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{r}</option>)}</select>
                  <SubmitButton size="sm" variant="secondary">Add</SubmitButton>
                </div>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
