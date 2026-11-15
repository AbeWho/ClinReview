import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { assignAction, unassignAction } from "@/app/actions/authoring";
import { WorkflowStepper } from "@/components/workflows/workflow-stepper";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses, ButtonLink, Card, EmptyState, formatDate, inputClasses, PageHeader } from "@/components/ui/primitives";
import { PriorityChip, TaskStatusChip } from "@/components/ui/status";
import { pageQuery } from "@/lib/server/context";
import { listProjects } from "@/lib/services/projects";
import { listQueue } from "@/lib/services/tasks";
import { STATUS_LABELS, TASK_STATUSES } from "@/lib/workflow/task-status";

export const metadata: Metadata = { title: "Labeling Queue" };

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ project?: string; status?: string; priority?: string; assignee?: string }> }) {
  const f = await searchParams;
  const d = await pageQuery(async (tx, actor) => {
    const projects = await listProjects(tx, { includeArchived: true });
    const managed = (await tx.query<{ project_id: string }>("select project_id from project_members where user_id = $1 and role in ('owner','admin')", [actor.id])).map((r) => r.project_id);
    const annotators = await tx.query<{ project_id: string; id: string; display_name: string }>(
      "select m.project_id, p.id, p.display_name from project_members m join profiles p on p.id = m.user_id where m.role = 'annotator' order by p.display_name");
    const rows = await listQueue(tx, actor, { projectId: f.project || undefined, status: f.status || undefined, priority: f.priority || undefined, assignee: f.assignee === "action" ? undefined : f.assignee || undefined, needsMyAction: f.assignee === "action" });
    return { projects, managed, annotators, rows };
  });
  const next = d.rows.find((t) => t.needs_my_action);

  return (
    <>
      <PageHeader title="Labeling Queue" icon={<ListChecks className="size-6" />} description="Tasks sorted by priority, then due date. Status is computed by the server from the underlying records."
        actions={next ? <ButtonLink href={`/label/${next.id}`} variant="primary">Start next task</ButtonLink> : undefined} />
      <WorkflowStepper current="queue" projectId={f.project} />
      <form className="mb-4 flex flex-wrap items-end gap-2" role="search" aria-label="Filter tasks">
        {([
          ["project", "Project", [["", "All projects"], ...d.projects.map((p) => [p.id, p.name])]],
          ["status", "Status", [["", "Any status"], ...TASK_STATUSES.map((s) => [s, STATUS_LABELS[s]])]],
          ["priority", "Priority", [["", "Any priority"], ["urgent", "Urgent"], ["high", "High"], ["normal", "Normal"], ["low", "Low"]]],
          ["assignee", "Assignee", [["", "Anyone"], ["me", "Assigned to me"], ["action", "Needs my labeling"], ["unassigned", "Unassigned"]]],
        ] as [keyof typeof f, string, string[][]][]).map(([name, label, opts]) => (
          <label key={name} className="text-xs font-medium text-ink-2">{label}
            <select name={name} defaultValue={f[name] ?? ""} className={`${inputClasses} mt-0.5 w-auto min-w-[150px]`}>
              {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ))}
        <button type="submit" className={buttonClasses("secondary")}>Apply</button>
        <Link href="/queue" className={buttonClasses("ghost")}>Reset</Link>
      </form>

      {d.rows.length === 0 ? <EmptyState title="No tasks match these filters" /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <caption className="sr-only">Labeling tasks</caption>
            <thead className="bg-canvas text-left text-xs text-ink-2">
              <tr><th className="px-4 py-2 font-medium">Case</th><th className="px-2 py-2 font-medium">Status</th><th className="px-2 py-2 font-medium">Priority</th><th className="px-2 py-2 font-medium">Progress</th><th className="px-2 py-2 font-medium">Assignees</th><th className="px-2 py-2 font-medium">Due</th><th className="px-2 py-2 font-medium"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.rows.map((t) => {
                const manage = d.managed.includes(t.project_id) && t.status !== "finalized";
                const candidates = d.annotators.filter((a) => a.project_id === t.project_id && !t.assignees.some((x) => x.id === a.id));
                return (
                  <tr key={t.id} className="align-top">
                    <td className="px-4 py-3"><Link href={`/label/${t.id}`} className="font-medium hover:text-brand">{t.case_title}</Link><p className="text-xs text-ink-2">{t.project_name} · {t.model_name}</p></td>
                    <td className="px-2 py-3"><TaskStatusChip status={t.status} />{t.finalized_via && <p className="mt-1 text-xs text-ink-2">via {t.finalized_via}</p>}</td>
                    <td className="px-2 py-3"><PriorityChip priority={t.priority} /></td>
                    <td className="px-2 py-3 tabular-nums text-ink-2">{t.submitted_count}/{t.required_annotations} submitted</td>
                    <td className="px-2 py-3">
                      <ul className="space-y-1">
                        {t.assignees.map((a) => (
                          <li key={a.id} className="flex items-center gap-1.5">{a.name}
                            {manage && <ActionForm action={unassignAction} confirmMessage={`Unassign ${a.name}?`}><input type="hidden" name="task_id" value={t.id} /><input type="hidden" name="annotator_id" value={a.id} /><SubmitButton variant="ghost" size="sm" pendingLabel="…">✕<span className="sr-only">Unassign {a.name}</span></SubmitButton></ActionForm>}
                          </li>
                        ))}
                        {!t.assignees.length && <li className="text-ink-2">Unassigned</li>}
                      </ul>
                      {manage && t.assignees.length < t.required_annotations && candidates.length > 0 && (
                        <ActionForm action={assignAction} className="mt-1 flex gap-1">
                          <input type="hidden" name="task_id" value={t.id} />
                          <label className="sr-only" htmlFor={`assign-${t.id}`}>Assign annotator</label>
                          <select id={`assign-${t.id}`} name="annotator_id" className={`${inputClasses} w-auto py-1 text-xs`}>{candidates.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}</select>
                          <SubmitButton size="sm" variant="secondary">Assign</SubmitButton>
                        </ActionForm>
                      )}
                    </td>
                    <td className="px-2 py-3 text-ink-2">{t.due_at ? formatDate(t.due_at, false) : "—"}</td>
                    <td className="px-2 py-3 text-right"><ButtonLink href={`/label/${t.id}`} size="sm" variant={t.needs_my_action ? "primary" : "secondary"}>{t.needs_my_action ? "Label" : "View"}</ButtonLink></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
