import type { Metadata } from "next";
import Link from "next/link";
import { Bot, ClipboardList, PencilLine, Send } from "lucide-react";
import { attachResponseAction, queueTaskAction } from "@/app/actions/authoring";
import { CaseSummary } from "@/components/clinical/case-summary";
import { PromptEditor } from "@/components/clinical/prompt-editor";
import { WorkflowStepper } from "@/components/workflows/workflow-stepper";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, ButtonLink, Card, CardHeader, DemoBadge, EmptyState, Field, formatDate, humanize, inputClasses, KeyValue, PageHeader } from "@/components/ui/primitives";
import { TaskStatusChip } from "@/components/ui/status";
import { can } from "@/lib/permissions/roles";
import { pageQuery } from "@/lib/server/context";
import { getCase } from "@/lib/services/cases";
import { getProjectRoles } from "@/lib/services/core";
import { getPromptForCase } from "@/lib/services/prompts";
import { listResponsesForCase } from "@/lib/services/responses";
import type { TaskStatus } from "@/lib/workflow/task-status";

export const metadata: Metadata = { title: "Case" };

export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const d = await pageQuery(async (tx, actor) => {
    const c = await getCase(tx, caseId);
    const [project] = await tx.query<{ status: string; default_required_annotations: number }>("select status, default_required_annotations from projects where id = $1", [c.project_id]);
    return {
      c, project: project!,
      roles: await getProjectRoles(tx, c.project_id, actor.id),
      prompt: await getPromptForCase(tx, caseId),
      responses: await listResponsesForCase(tx, caseId),
      annotators: await tx.query<{ id: string; display_name: string }>(
        "select p.id, p.display_name from project_members m join profiles p on p.id = m.user_id where m.project_id = $1 and m.role = 'annotator' order by p.display_name", [c.project_id]),
    };
  });
  const { c, roles, prompt, responses, annotators, project } = d;
  const canAuthor = can(roles, "author_content") && project.status === "active";
  const current = prompt?.versions[0];

  return (
    <>
      <PageHeader title={c.title}
        description={<><Link href={`/projects/${c.project_id}`} className="text-brand underline">{c.project_name}</Link> · {humanize(c.data_classification)} · {humanize(c.source_type)} · hash <code className="text-xs">{c.content_hash.slice(0, 12)}</code></>}
        actions={<>
          {c.is_demo && <DemoBadge />}
          {canAuthor && (c.prompt_count === 0
            ? <ButtonLink href={`/cases/${c.id}/edit`} size="sm">Edit case</ButtonLink>
            : <Badge tone="neutral">Frozen: used by a prompt</Badge>)}
        </>} />
      <WorkflowStepper current={responses.length ? "queue" : prompt ? "prompt" : "intake"} projectId={c.project_id} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Case brief" icon={<ClipboardList className="size-4" />} subtitle="Synthetic scenario (immutable once saved)" />
            <div className="p-4"><CaseSummary scenario={c.scenario_json} /></div>
            <div className="border-t border-line px-4 py-3 text-xs text-ink-2"><strong className="text-ink">Source / provenance:</strong> {c.source_notes} · created {formatDate(c.created_at)} by {c.created_by_name}</div>
          </Card>
          {prompt && prompt.versions.length > 0 && (
            <Card>
              <CardHeader title="Prompt version history" subtitle="Versions are immutable; responses are pinned to the exact version they answered." />
              <ol className="divide-y divide-line">
                {prompt.versions.map((v) => (
                  <li key={v.id} className="px-4 py-3">
                    <details>
                      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold">v{v.version_number}</span>
                        {v.id === prompt.prompt.current_version_id && <Badge tone="brand">Current</Badge>}
                        {v.response_count > 0 && <Badge tone="neutral">{v.response_count} response(s) pinned</Badge>}
                        <span className="text-xs text-ink-2">{formatDate(v.created_at)} · {v.created_by_name}{v.template_key ? ` · template: ${v.template_key}` : ""}</span>
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-canvas p-3 font-mono text-xs leading-relaxed">{v.prompt_text}</p>
                    </details>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Prompt Builder" icon={<PencilLine className="size-4" />} subtitle={current ? `Current: version ${current.version_number}` : "No prompt yet"} />
            <div className="p-4">
              <PromptEditor caseId={c.id} scenario={c.scenario_json} currentVersion={current?.version_number ?? 0} currentText={current?.prompt_text ?? ""} tags={prompt?.prompt.tags ?? []}
                canEdit={canAuthor} lockedReason="Only project owners/admins can edit prompts in an active project." />
            </div>
          </Card>

          <Card>
            <CardHeader title="Model responses" icon={<Bot className="size-4" />} subtitle="Untrusted example answers to evaluate. Never clinical recommendations." />
            {responses.length === 0 && <div className="p-4"><EmptyState title="No responses yet">Save a prompt version, then attach a prewritten example response below.</EmptyState></div>}
            <ul className="divide-y divide-line">
              {responses.map((r) => (
                <li key={r.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{r.model_name} <span className="font-normal text-ink-2">@ {r.model_version}</span></p>
                    {r.task_id ? <Link href={`/label/${r.task_id}`} className="flex items-center gap-2 text-sm text-brand underline">Task <TaskStatusChip status={r.task_status as TaskStatus} /></Link> : <Badge tone="warn">Not queued</Badge>}
                  </div>
                  <KeyValue items={[
                    ["Answers prompt", `v${r.version_number}`],
                    ["Origin", <span key="o">{humanize(r.origin)}{r.origin !== "provider" && " (imported, not generated by ClinReview)"}</span>],
                    ["Provider", r.provider],
                    ["Settings", <code key="s" className="text-xs">{JSON.stringify(r.generation_settings)}</code>],
                    ["Generated at", r.generated_at ? formatDate(r.generated_at) : "Unknown"],
                    ["Recorded", `${formatDate(r.created_at)} by ${r.created_by_name}`],
                  ]} />
                  <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-canvas p-3 text-sm">{r.response_text}</p>
                  {!r.task_id && canAuthor && (
                    <ActionForm action={queueTaskAction} className="space-y-3 rounded-lg border border-line p-3">
                      <p className="flex items-center gap-1.5 text-sm font-semibold"><Send className="size-4 text-brand" aria-hidden /> Queue for labeling</p>
                      <input type="hidden" name="response_id" value={r.id} /><input type="hidden" name="case_id" value={c.id} />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Priority" htmlFor={`priority-${r.id}`}><select id={`priority-${r.id}`} name="priority" defaultValue="normal" className={inputClasses}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
                        <Field label="Independent annotations" htmlFor={`req-${r.id}`}><select id={`req-${r.id}`} name="required_annotations" defaultValue={String(project.default_required_annotations)} className={inputClasses}><option value="1">1</option><option value="2">2 (enables adjudication)</option></select></Field>
                        <Field label="Due" htmlFor={`due-${r.id}`}><input id={`due-${r.id}`} name="due_at" type="date" className={inputClasses} /></Field>
                      </div>
                      <fieldset>
                        <legend className="text-sm font-medium">Assign annotators (optional)</legend>
                        <div className="mt-1 flex flex-wrap gap-3">
                          {annotators.map((a) => <label key={a.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="annotator_ids" value={a.id} className="size-4 accent-[var(--color-brand)]" /> {a.display_name}</label>)}
                          {annotators.length === 0 && <span className="text-sm text-ink-2">No annotators in this project yet. Add members on the project page.</span>}
                        </div>
                      </fieldset>
                      <SubmitButton size="sm">Queue task</SubmitButton>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            {canAuthor && current && (
              <ActionForm action={attachResponseAction} className="space-y-3 border-t border-line p-4" resetOnSuccess>
                <p className="text-sm font-semibold">Attach a prewritten model response</p>
                <p className="text-xs text-ink-2">V1 records responses you paste in (ManualResponseProvider). No model is called and no API keys are used.</p>
                <input type="hidden" name="case_id" value={c.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Prompt version" htmlFor="prompt_version_id" required><select id="prompt_version_id" name="prompt_version_id" className={inputClasses}>{prompt!.versions.map((v) => <option key={v.id} value={v.id}>v{v.version_number}{v.id === prompt!.prompt.current_version_id ? " (current)" : ""}</option>)}</select></Field>
                  <Field label="Provider / source" htmlFor="provider" required><input id="provider" name="provider" required defaultValue="manual-entry" className={inputClasses} /></Field>
                  <Field label="Model name" htmlFor="model_name" required><input id="model_name" name="model_name" required placeholder="e.g. example-model" className={inputClasses} /></Field>
                  <Field label="Model version" htmlFor="model_version" required><input id="model_version" name="model_version" required defaultValue="unspecified" className={inputClasses} /></Field>
                  <Field label="Generated at (if known)" htmlFor="generated_at"><input id="generated_at" name="generated_at" type="datetime-local" className={inputClasses} /></Field>
                  <Field label="Generation settings (JSON)" htmlFor="generation_settings"><input id="generation_settings" name="generation_settings" placeholder='{"temperature": 0.2}' className={`${inputClasses} font-mono`} /></Field>
                </div>
                <Field label="Response text" htmlFor="response_text" required><textarea id="response_text" name="response_text" required rows={6} className={inputClasses} /></Field>
                <SubmitButton size="sm">Attach response</SubmitButton>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
