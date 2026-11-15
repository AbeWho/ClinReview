import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, inputClasses } from "@/components/ui/primitives";
import type { ActionResult } from "@/lib/server/context";

interface Version { id: string; name: string; version: string }
export interface ProjectDefaults {
  id: string; name: string; clinical_domain: string; description: string; dataset_purpose: string;
  taxonomy_version_id: string; rubric_version_id: string; default_required_annotations: number; blind_annotation: boolean;
}

/** Shared create/edit form. Version selects are disabled (and resubmitted unchanged) once annotations exist. */
export function ProjectForm({ action, taxonomies, rubrics, defaults, versionsLocked, submitLabel }: {
  action: (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;
  taxonomies: Version[]; rubrics: Version[]; defaults?: ProjectDefaults; versionsLocked?: boolean; submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      {defaults && <input type="hidden" name="project_id" value={defaults.id} />}
      <Field label="Project name" htmlFor="name" required><input id="name" name="name" required minLength={3} maxLength={120} defaultValue={defaults?.name} className={inputClasses} placeholder="Heart Failure Reasoning Evaluation" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Clinical domain" htmlFor="clinical_domain" required><input id="clinical_domain" name="clinical_domain" required defaultValue={defaults?.clinical_domain} className={inputClasses} placeholder="Cardiology" /></Field>
        <Field label="Independent annotations per item" htmlFor="default_required_annotations" hint="Default for new tasks. 2 enables disagreement detection and adjudication.">
          <select id="default_required_annotations" name="default_required_annotations" className={inputClasses} defaultValue={String(defaults?.default_required_annotations ?? 2)}>
            <option value="1">1 annotator + clinical review</option>
            <option value="2">2 independent annotators + review + adjudication</option>
          </select>
        </Field>
      </div>
      <Field label="Dataset goal" htmlFor="dataset_purpose" required hint="What will this evaluation dataset be used for?"><textarea id="dataset_purpose" name="dataset_purpose" required rows={2} defaultValue={defaults?.dataset_purpose} className={inputClasses} /></Field>
      <Field label="Description / scope" htmlFor="description"><textarea id="description" name="description" rows={3} defaultValue={defaults?.description} className={inputClasses} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Taxonomy version" htmlFor="taxonomy_version_id" required hint={versionsLocked ? "Locked: annotations already use this version." : "Published versions are immutable."}>
          {versionsLocked && <input type="hidden" name="taxonomy_version_id" value={defaults!.taxonomy_version_id} />}
          <select id="taxonomy_version_id" name={versionsLocked ? undefined : "taxonomy_version_id"} disabled={versionsLocked} defaultValue={defaults?.taxonomy_version_id} className={inputClasses}>{taxonomies.map((t) => <option key={t.id} value={t.id}>{t.name} v{t.version}</option>)}</select>
        </Field>
        <Field label="Rubric version" htmlFor="rubric_version_id" required hint={versionsLocked ? "Locked: annotations already use this version." : undefined}>
          {versionsLocked && <input type="hidden" name="rubric_version_id" value={defaults!.rubric_version_id} />}
          <select id="rubric_version_id" name={versionsLocked ? undefined : "rubric_version_id"} disabled={versionsLocked} defaultValue={defaults?.rubric_version_id} className={inputClasses}>{rubrics.map((t) => <option key={t.id} value={t.id}>{t.name} v{t.version}</option>)}</select>
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="blind_annotation" defaultChecked={defaults?.blind_annotation ?? true} className="mt-0.5 size-4 accent-[var(--color-brand)]" />
        <span><strong>Blind annotation</strong> (recommended). Annotators cannot see each other&apos;s labels; enforced by database row-level security.</span></label>
      <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-ink-2">Data policy: this project accepts <strong>fully synthetic cases only</strong>. De-identified real data is disabled in V1.</p>
      <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
