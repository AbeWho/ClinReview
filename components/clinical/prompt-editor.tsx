"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { savePromptAction } from "@/app/actions/authoring";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, inputClasses } from "@/components/ui/primitives";
import { contextChecklist, PROMPT_TEMPLATES, renderTemplate, scenarioVariables } from "@/lib/prompts/templates";
import type { Scenario } from "@/lib/validation/case";

export function PromptEditor({ caseId, scenario, currentVersion, currentText, tags, canEdit, lockedReason }: {
  caseId: string; scenario: Scenario; currentVersion: number; currentText: string; tags: string[]; canEdit: boolean; lockedReason?: string;
}) {
  const [text, setText] = useState(currentText);
  const [templateKey, setTemplateKey] = useState("");
  const checklist = useMemo(() => contextChecklist(text, scenario), [text, scenario]);
  const vars = useMemo(() => scenarioVariables(scenario), [scenario]);

  return (
    <ActionForm action={savePromptAction} className="space-y-3">
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="based_on_version" value={currentVersion} />
      <input type="hidden" name="template_key" value={templateKey} />
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Insert template" htmlFor="tpl" className="min-w-[220px] flex-1" hint="Fills {{variables}} from the structured case; you can edit afterwards.">
            <select id="tpl" className={inputClasses} value={templateKey} onChange={(e) => {
              const t = PROMPT_TEMPLATES.find((x) => x.key === e.target.value);
              setTemplateKey(e.target.value);
              if (t && (!text.trim() || window.confirm("Replace the editor text with this template?"))) setText(renderTemplate(t.body, vars));
            }}>
              <option value="">Choose…</option>
              {PROMPT_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
        </div>
      )}
      <Field label={currentVersion ? `Prompt text (editing creates version ${currentVersion + 1})` : "Prompt text"} htmlFor="prompt_text" required hint={`${text.length} / 8000 characters`}>
        <textarea id="prompt_text" name="prompt_text" rows={9} value={text} onChange={(e) => setText(e.target.value)} readOnly={!canEdit} className={`${inputClasses} font-mono text-[13px] leading-relaxed`} />
      </Field>
      <Field label="Tags" htmlFor="tags" hint="Comma-separated, e.g. Cardiology, CKD"><input id="tags" name="tags" defaultValue={tags.join(", ")} readOnly={!canEdit} className={inputClasses} /></Field>
      <div>
        <p className="text-sm font-medium">Required clinical context checklist</p>
        <ul className="mt-1 grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
          {checklist.filter((c) => c.applicable).map((c) => (
            <li key={c.label} className="flex items-center gap-1.5">
              {c.present ? <CheckCircle2 className="size-4 text-ok" aria-hidden /> : <CircleDashed className="size-4 text-warn" aria-hidden />}
              <span>{c.label}<span className="sr-only">{c.present ? ": included" : ": not detected"}</span></span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-ink-2">Heuristic: checks whether case values appear in the prompt text.</p>
      </div>
      {canEdit ? <SubmitButton>{currentVersion ? "Save new version" : "Save version 1"}</SubmitButton> : <p className="text-xs text-ink-2">{lockedReason}</p>}
    </ActionForm>
  );
}
