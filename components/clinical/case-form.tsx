"use client";

import { useState } from "react";
import { createCaseAction, updateCaseAction } from "@/app/actions/cases";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, inputClasses, Notice } from "@/components/ui/primitives";
import { CASE_TEMPLATES } from "@/lib/prompts/case-templates";
import { AGE_BANDS, type Scenario } from "@/lib/validation/case";

const EMPTY: Scenario = { age_band: "50-59", sex: "unspecified", chief_complaint: "", hpi: "", past_history: "", comorbidities: [], medications: [], allergies: [], vitals: { bp: "", hr: "", rr: "", spo2: "", temp_c: "" }, labs: [], social_factors: "" };

export interface CaseFormInitial { caseId: string; projectId: string; title: string; scenario: Scenario; sourceNotes: string; sourceType: string }

export function CaseForm({ projects, defaultProjectId, initial }: { projects: { id: string; name: string }[]; defaultProjectId?: string; initial?: CaseFormInitial }) {
  const [tpl, setTpl] = useState<{ key: string; title: string; scenario: Scenario } | null>(null);
  const editing = !!initial;
  const s = initial?.scenario ?? tpl?.scenario ?? EMPTY;
  const lines = (v: string[]) => v.join("\n");
  return (
    <ActionForm action={editing ? updateCaseAction : createCaseAction} className="space-y-5">
      {initial && <><input type="hidden" name="case_id" value={initial.caseId} /><input type="hidden" name="project_id" value={initial.projectId} /></>}
      <Notice tone="warn" title="Synthetic data only">
        Never enter real patient names, dates, record numbers, contact details, addresses or exact ages over 89. ClinReview screens for obvious identifiers,
        but that check is a safety net, <strong>not</strong> de-identification.
      </Notice>
      {!editing && <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project" htmlFor="project_id" required>
          <select id="project_id" name="project_id" defaultValue={defaultProjectId} className={inputClasses}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </Field>
        <Field label="Start from an example (optional)" htmlFor="template" hint="Predefined fictional templates stored in the app.">
          <select id="template" className={inputClasses} value={tpl?.key ?? ""} onChange={(e) => setTpl(CASE_TEMPLATES.find((t) => t.key === e.target.value) ?? null)}>
            <option value="">Blank case</option>
            {CASE_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
          </select>
        </Field>
      </div>}
      <div key={tpl?.key ?? "blank"} className="space-y-4">
        <input type="hidden" name="source_type" value={initial?.sourceType ?? (tpl ? "template_synthetic" : "authored_synthetic")} />
        <Field label="Case title" htmlFor="title" required><input id="title" name="title" required defaultValue={initial?.title ?? tpl?.title ?? ""} className={inputClasses} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Age band" htmlFor="age_band" required hint="Bands, not exact ages."><select id="age_band" name="age_band" defaultValue={s.age_band} className={inputClasses}>{AGE_BANDS.map((b) => <option key={b}>{b}</option>)}</select></Field>
          <Field label="Sex" htmlFor="sex"><select id="sex" name="sex" defaultValue={s.sex} className={inputClasses}><option value="female">Female</option><option value="male">Male</option><option value="unspecified">Unspecified</option></select></Field>
        </div>
        <Field label="Chief complaint" htmlFor="chief_complaint" required><input id="chief_complaint" name="chief_complaint" required defaultValue={s.chief_complaint} className={inputClasses} /></Field>
        <Field label="History of present illness" htmlFor="hpi" required><textarea id="hpi" name="hpi" required rows={3} defaultValue={s.hpi} className={inputClasses} /></Field>
        <Field label="Past history" htmlFor="past_history"><textarea id="past_history" name="past_history" rows={2} defaultValue={s.past_history} className={inputClasses} /></Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Comorbidities" htmlFor="comorbidities" hint="One per line"><textarea id="comorbidities" name="comorbidities" rows={4} defaultValue={lines(s.comorbidities)} className={inputClasses} /></Field>
          <Field label="Medications" htmlFor="medications" hint="One per line, with dose if relevant"><textarea id="medications" name="medications" rows={4} defaultValue={lines(s.medications)} className={inputClasses} /></Field>
          <Field label="Allergies" htmlFor="allergies" hint="One per line"><textarea id="allergies" name="allergies" rows={4} defaultValue={lines(s.allergies)} className={inputClasses} /></Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Vitals</legend>
          <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {([["bp", "BP"], ["hr", "HR"], ["rr", "RR"], ["spo2", "SpO₂"], ["temp_c", "Temp °C"]] as const).map(([k, l]) => (
              <Field key={k} label={l} htmlFor={k}><input id={k} name={k} defaultValue={s.vitals[k]} className={inputClasses} /></Field>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Key labs" htmlFor="labs" hint="One per line"><textarea id="labs" name="labs" rows={3} defaultValue={lines(s.labs)} className={inputClasses} /></Field>
          <Field label="Relevant social factors" htmlFor="social_factors"><textarea id="social_factors" name="social_factors" rows={3} defaultValue={s.social_factors} className={inputClasses} /></Field>
        </div>
        <Field label="Source / provenance notes" htmlFor="source_notes" required hint="How was this scenario created? e.g. 'Authored by project lead as a fictional teaching vignette.'">
          <textarea id="source_notes" name="source_notes" required rows={2} defaultValue={initial?.sourceNotes ?? (tpl ? `Adapted from built-in ClinReview synthetic template '${tpl.key}'.` : "")} className={inputClasses} />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="synthetic_attestation" required className="mt-0.5 size-4 accent-[var(--color-brand)]" />
        <span>I confirm this case is <strong>fully synthetic</strong> and contains no real patient information.</span>
      </label>
      <SubmitButton pendingLabel="Validating…">{editing ? "Save changes" : "Save synthetic case"}</SubmitButton>
    </ActionForm>
  );
}
