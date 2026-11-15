"use client";

import { useState } from "react";
import { submitAdjudicationAction } from "@/app/actions/reviews";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses, Field, inputClasses } from "@/components/ui/primitives";
import type { RubricDefinition, TaxonomyDefinition } from "@/lib/taxonomy/schema";

interface Source { id: string; name: string; labels: Record<string, unknown>; rationale: string; confidence: number | null }

export function AdjudicationEditor({ taskId, sources, taxonomy, rubric }: { taskId: string; sources: Source[]; taxonomy: TaxonomyDefinition; rubric: RubricDefinition }) {
  const init = (s: Source) => ({
    task_type: (s.labels.task_type as string) ?? "", verdict: (s.labels.verdict as string) ?? "", safety_severity: (s.labels.safety_severity as string) ?? "",
    findings: (s.labels.findings as string[]) ?? [], rubric_scores: (s.labels.rubric_scores as Record<string, number | "na">) ?? {},
    question_flags: (s.labels.question_flags as string[]) ?? [], escalation_recommendation: (s.labels.escalation_recommendation as string) ?? "",
  });
  const [labels, setLabels] = useState(init(sources[0]!));
  const [rationale, setRationale] = useState("");
  const [confidence, setConfidence] = useState(0.7);
  const final = { labels, rationale, confidence };

  return (
    <ActionForm action={submitAdjudicationAction} className="space-y-4">
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="final_json" value={JSON.stringify(final)} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-2">Start from:</span>
        {sources.map((s) => <button key={s.id} type="button" className={buttonClasses("secondary", "sm")} onClick={() => { setLabels(init(s)); setConfidence(s.confidence ?? 0.7); }}>{s.name}&apos;s labels</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Final verdict" htmlFor="adj-verdict" required>
          <select id="adj-verdict" value={labels.verdict} onChange={(e) => setLabels({ ...labels, verdict: e.target.value })} className={inputClasses}>
            {taxonomy.verdicts.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Final severity" htmlFor="adj-sev" required>
          <select id="adj-sev" value={labels.safety_severity} onChange={(e) => setLabels({ ...labels, safety_severity: e.target.value })} className={inputClasses}>
            {taxonomy.severities.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Task type" htmlFor="adj-tt" required>
          <select id="adj-tt" value={labels.task_type} onChange={(e) => setLabels({ ...labels, task_type: e.target.value })} className={inputClasses}>
            {taxonomy.task_types.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Final findings</legend>
        <div className="mt-1 grid gap-1 sm:grid-cols-2">
          {taxonomy.findings.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={labels.findings.includes(f.key)} onChange={() => setLabels({ ...labels, findings: labels.findings.includes(f.key) ? labels.findings.filter((x) => x !== f.key) : [...labels.findings, f.key] })} className="size-4 accent-[var(--color-brand)]" />{f.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">Final rubric scores</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {rubric.dimensions.map((d) => (
            <label key={d.key} className="flex items-center justify-between gap-2 text-sm">{d.label}
              <select value={String(labels.rubric_scores[d.key] ?? "")} onChange={(e) => setLabels({ ...labels, rubric_scores: { ...labels.rubric_scores, [d.key]: e.target.value === "na" ? "na" : Number(e.target.value) } })} className={`${inputClasses} w-24 py-1`}>
                <option value="" disabled>—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}{d.allow_na && <option value="na">N/A</option>}
              </select>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Escalation recommendation" htmlFor="adj-esc" hint="Required for red flags or critical severity."><textarea id="adj-esc" rows={2} value={labels.escalation_recommendation} onChange={(e) => setLabels({ ...labels, escalation_recommendation: e.target.value })} className={inputClasses} /></Field>
      <Field label="Final rationale" htmlFor="adj-rat" required hint="20+ characters: the clinical rationale for the final label."><textarea id="adj-rat" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} className={inputClasses} /></Field>
      <Field label={`Confidence: ${confidence.toFixed(2)}`} htmlFor="adj-conf"><input id="adj-conf" type="range" min={0} max={1} step={0.05} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full accent-[var(--color-brand)]" /></Field>
      <Field label="Reconciliation note" htmlFor="reason" required hint="Why this resolution? Address the specific disagreement. Stored permanently in the audit trail.">
        <textarea id="reason" name="reason" rows={4} className={inputClasses} />
      </Field>
      <SubmitButton pendingLabel="Finalizing…">Finalize adjudication</SubmitButton>
    </ActionForm>
  );
}
