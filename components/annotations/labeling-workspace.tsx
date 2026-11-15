"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, CheckCircle2, CircleAlert, ClipboardCheck, Loader2, Plus, Quote, Trash2 } from "lucide-react";
import { saveDraftAction, submitAnnotationAction } from "@/app/actions/annotations";
import { buttonClasses, Card, CardHeader, inputClasses, Notice } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import type { RubricDefinition, TaxonomyDefinition } from "@/lib/taxonomy/schema";
import { ResponseText } from "./response-text";

export interface EvidenceItem { start: number; end: number; quote: string; issue_category: string | null; notes: string }
export interface LabelsState {
  task_type: string | null; verdict: string | null; safety_severity: string | null; findings: string[];
  rubric_scores: Record<string, number | "na" | null>; question_flags: string[]; escalation_recommendation: string;
  reference: { citation: string; url: string; reference_date: string };
}
type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export function LabelingWorkspace(props: {
  taskId: string; annotationId: string; lockVersion: number; revision: number; responseText: string;
  responseMeta: string; casePane: React.ReactNode; reviewNotice?: React.ReactNode;
  taxonomy: TaxonomyDefinition; rubric: RubricDefinition; taxonomyLabel: string;
  initial: { labels: Partial<LabelsState>; rationale: string; confidence: number | null; evidence: EvidenceItem[] };
}) {
  const { taxonomy, rubric } = props;
  const router = useRouter();
  const [labels, setLabels] = useState<LabelsState>({
    task_type: null, verdict: null, safety_severity: null, findings: [], rubric_scores: {}, question_flags: [], escalation_recommendation: "",
    ...props.initial.labels,
    reference: { citation: "", url: "", reference_date: "", ...(props.initial.labels.reference ?? {}) },
  });
  const [rationale, setRationale] = useState(props.initial.rationale);
  const [confidence, setConfidence] = useState<number | null>(props.initial.confidence);
  const [evidence, setEvidence] = useState<EvidenceItem[]>(props.initial.evidence);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [selection, setSelection] = useState<{ start: number; end: number; quote: string } | null>(null);
  const [quoteInput, setQuoteInput] = useState("");
  const [activeEvidence, setActiveEvidence] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const lockRef = useRef(props.lockVersion);
  const inflight = useRef<Promise<boolean> | null>(null);
  const firstRender = useRef(true);
  const responseRef = useRef<HTMLDivElement>(null);

  const payload = useCallback(() => ({
    labels: { ...labels, reference: labels.reference.citation || labels.reference.url ? labels.reference : undefined },
    rationale, confidence, evidence,
  }), [labels, rationale, confidence, evidence]);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  /** Save the latest state. Serialized so two saves never race; conflicts stop autosave. */
  const save = useCallback(async (): Promise<boolean> => {
    if (inflight.current) await inflight.current;
    const run = (async () => {
      setStatus("saving");
      const r = await saveDraftAction(props.annotationId, lockRef.current, payloadRef.current());
      if (r.ok && r.data) {
        lockRef.current = r.data.lock_version;
        setStatus("saved"); setSavedAt(new Date()); setMessage(null);
        return true;
      }
      if (!r.ok) {
        setStatus(r.code === "conflict" ? "conflict" : "error");
        setMessage(r.error); setFieldErrors(r.fieldErrors ?? {});
      }
      return false;
    })();
    inflight.current = run;
    const ok = await run;
    inflight.current = null;
    return ok;
  }, [props.annotationId]);

  // Debounced autosave whenever the annotation changes.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (status === "conflict") return;
    setStatus("dirty");
    const t = setTimeout(() => { void save(); }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels, rationale, confidence, evidence]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (status === "dirty" || status === "saving") e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [status]);

  const onSelect = () => {
    const sel = window.getSelection();
    const root = responseRef.current;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !root) return setSelection(null);
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return setSelection(null);
    const pre = document.createRange();
    pre.selectNodeContents(root);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const quote = range.toString();
    if (!quote.trim()) return setSelection(null);
    setSelection({ start, end: start + quote.length, quote });
  };

  const addEvidence = (s: { start: number; end: number; quote: string }) => {
    if (props.responseText.slice(s.start, s.end) !== s.quote) { setMessage("Selection did not match the response text; please reselect."); return; }
    if (evidence.some((e) => s.start < e.end && e.start < s.end)) { setMessage("That selection overlaps existing evidence. Remove the existing span first."); return; }
    const negative = labels.findings.find((f) => f !== "clinically_correct") ?? null;
    setEvidence((prev) => [...prev, { ...s, issue_category: negative, notes: "" }].sort((a, b) => a.start - b.start));
    setSelection(null); setMessage(null);
    window.getSelection()?.removeAllRanges();
  };

  const addByQuote = () => {
    const q = quoteInput;
    const start = props.responseText.indexOf(q);
    if (!q || start < 0) { setMessage("Quote not found. It must match the response text exactly (including punctuation)."); return; }
    addEvidence({ start, end: start + q.length, quote: q });
    setQuoteInput("");
  };

  const submit = async () => {
    setSubmitting(true); setFieldErrors({});
    const saved = status === "saved" || status === "idle" ? true : await save();
    if (!saved) { setSubmitting(false); return; }
    const r = await submitAnnotationAction(props.annotationId, lockRef.current, props.taskId);
    setSubmitting(false);
    if (r.ok) { setMessage(null); router.refresh(); return; }
    setMessage(r.error); setFieldErrors(r.fieldErrors ?? {});
    document.getElementById("annotation-errors")?.focus();
  };

  const err = (k: string) => fieldErrors[k]?.join(" ");
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const set = <K extends keyof LabelsState>(k: K, v: LabelsState[K]) => setLabels((p) => ({ ...p, [k]: v }));
  const severityInfo = taxonomy.severities.find((s) => s.key === labels.safety_severity);

  const statusText: Record<SaveStatus, React.ReactNode> = {
    idle: "No changes yet", dirty: "Unsaved changes…",
    saving: <><Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…</>,
    saved: <><CheckCircle2 className="size-3.5 text-ok" aria-hidden /> Draft saved {savedAt?.toLocaleTimeString()}</>,
    error: <><CircleAlert className="size-3.5 text-danger" aria-hidden /> Save failed</>,
    conflict: <><CircleAlert className="size-3.5 text-danger" aria-hidden /> Edited elsewhere: reload</>,
  };

  return (
    <div className="space-y-4">
      {props.reviewNotice}
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <p className="flex items-center gap-1.5 text-sm text-ink-2" aria-live="polite" role="status">Revision {props.revision} · {statusText[status]}</p>
        <div className="flex gap-2">
          {status === "conflict"
            ? <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => window.location.reload()}>Reload latest</button>
            : <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => void save()} disabled={status === "saving"}>Save draft</button>}
          <button type="button" className={buttonClasses("primary", "sm")} onClick={() => void submit()} disabled={submitting || status === "conflict"}>
            <ClipboardCheck className="size-4" aria-hidden /> {submitting ? "Submitting…" : "Submit annotation"}
          </button>
        </div>
      </div>

      {(message || Object.keys(fieldErrors).length > 0) && (
        <div id="annotation-errors" tabIndex={-1} role="alert" className="rounded-lg border border-danger/30 bg-danger-pale px-3 py-2 text-sm">
          {message && <p className="font-medium text-danger">{message}</p>}
          {Object.keys(fieldErrors).length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{Object.entries(fieldErrors).flatMap(([k, v]) => v.map((m, i) => <li key={k + i}>{m}</li>))}</ul>}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.05fr)]">
        {props.casePane}

        <Card className="xl:sticky xl:top-16 xl:self-start">
          <CardHeader title="Model response" icon={<Bot className="size-4" />} subtitle={props.responseMeta} />
          <div className="space-y-3 p-4">
            <p className="text-xs text-ink-2">Select text in the response to attach it as evidence. The quote and its exact character offsets are saved.</p>
            <div onMouseUp={onSelect} onKeyUp={onSelect} className="rounded-lg border border-line bg-canvas/60 p-3">
              <ResponseText text={props.responseText} spans={evidence.map((e) => ({ start: e.start, end: e.end, label: e.issue_category }))} activeIndex={activeEvidence} containerRef={responseRef} />
            </div>
            {selection && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand-pale px-3 py-2 text-sm">
                <Quote className="size-4 text-brand" aria-hidden />
                <span className="min-w-0 flex-1 truncate italic">“{selection.quote}”</span>
                <button type="button" className={buttonClasses("primary", "sm")} onClick={() => addEvidence(selection)}><Plus className="size-3.5" aria-hidden /> Add as evidence</button>
              </div>
            )}
            <div className="flex gap-2">
              <label htmlFor="quote-input" className="sr-only">Add evidence by exact quote</label>
              <input id="quote-input" value={quoteInput} onChange={(e) => setQuoteInput(e.target.value)} placeholder="Or paste an exact quote (keyboard-friendly)" className={`${inputClasses} py-1.5`} />
              <button type="button" className={buttonClasses("secondary", "sm")} onClick={addByQuote}>Add</button>
            </div>
            <div>
              <p className="text-sm font-medium">Evidence spans ({evidence.length}) {err("evidence") && <span className="text-xs font-normal text-danger">· {err("evidence")}</span>}</p>
              <ul className="mt-1 space-y-2">
                {evidence.map((e, i) => (
                  <li key={`${e.start}-${e.end}`} className="rounded-lg border border-line p-2 text-sm" onMouseEnter={() => setActiveEvidence(i)} onMouseLeave={() => setActiveEvidence(null)}>
                    <div className="flex items-start gap-2">
                      <q className="min-w-0 flex-1 italic">{e.quote}</q>
                      <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => setEvidence((p) => p.filter((_, j) => j !== i))} aria-label={`Remove evidence: ${e.quote.slice(0, 40)}`}><Trash2 className="size-3.5" aria-hidden /></button>
                    </div>
                    <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                      <label className="text-xs text-ink-2">Issue
                        <select value={e.issue_category ?? ""} onChange={(ev) => setEvidence((p) => p.map((x, j) => (j === i ? { ...x, issue_category: ev.target.value || null } : x)))} className={`${inputClasses} mt-0.5 py-1 text-xs`}>
                          <option value="">(none)</option>
                          {taxonomy.findings.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                      </label>
                      <label className="text-xs text-ink-2">Note
                        <input value={e.notes} onChange={(ev) => setEvidence((p) => p.map((x, j) => (j === i ? { ...x, notes: ev.target.value } : x)))} className={`${inputClasses} mt-0.5 py-1 text-xs`} />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Annotation & rubric" icon={<ClipboardCheck className="size-4" />} subtitle={props.taxonomyLabel} />
          <div className="space-y-5 p-4">
            <div>
              <label htmlFor="task_type" className="text-sm font-medium">Clinical task type <span className="text-danger" aria-hidden>*</span></label>
              <select id="task_type" value={labels.task_type ?? ""} onChange={(e) => set("task_type", e.target.value || null)} aria-invalid={!!err("labels.task_type")} className={`${inputClasses} mt-1`}>
                <option value="">Select…</option>
                {taxonomy.task_types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              {err("labels.task_type") && <p className="mt-0.5 text-xs text-danger">{err("labels.task_type")}</p>}
            </div>

            <fieldset>
              <legend className="text-sm font-medium">Final verdict <span className="text-danger" aria-hidden>*</span></legend>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {taxonomy.verdicts.map((v) => (
                  <label key={v.key} title={v.definition} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand", labels.verdict === v.key ? "border-brand bg-brand-pale font-medium" : "border-line")}>
                    <input type="radio" name="verdict" value={v.key} checked={labels.verdict === v.key} onChange={() => set("verdict", v.key)} className="sr-only" />{v.label}
                  </label>
                ))}
              </div>
              {err("labels.verdict") && <p className="mt-0.5 text-xs text-danger">{err("labels.verdict")}</p>}
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium">Safety severity <span className="text-danger" aria-hidden>*</span> <span className="font-normal text-ink-2">(plausible patient impact, not writing quality)</span></legend>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {taxonomy.severities.map((s) => (
                  <label key={s.key} title={s.criteria} className={cn("cursor-pointer rounded-lg border px-2.5 py-1 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand", labels.safety_severity === s.key ? (s.rank >= 3 ? "border-danger bg-danger-pale font-medium text-danger" : s.rank === 2 ? "border-warn bg-warn-pale font-medium" : "border-brand bg-brand-pale font-medium") : "border-line")}>
                    <input type="radio" name="severity" value={s.key} checked={labels.safety_severity === s.key} onChange={() => set("safety_severity", s.key)} className="sr-only" />{s.label}
                  </label>
                ))}
              </div>
              {severityInfo && <p className="mt-1 text-xs text-ink-2">{severityInfo.label}: {severityInfo.criteria}</p>}
              {err("labels.safety_severity") && <p className="mt-0.5 text-xs text-danger">{err("labels.safety_severity")}</p>}
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium">Findings <span className="text-danger" aria-hidden>*</span> <span className="font-normal text-ink-2">(select all that apply)</span></legend>
              <ul className="mt-1 space-y-1">
                {taxonomy.findings.map((f) => (
                  <li key={f.key}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
                        <input type="checkbox" id={`f-${f.key}`} checked={labels.findings.includes(f.key)} onChange={() => set("findings", toggle(labels.findings, f.key))} onClick={(e) => e.stopPropagation()} className="size-4 accent-[var(--color-brand)]" />
                        <label htmlFor={`f-${f.key}`} onClick={(e) => e.stopPropagation()}>{f.label}</label>
                        <span className="ml-auto text-xs text-ink-2 group-open:hidden">definition</span>
                      </summary>
                      <div className="ml-6 mt-1 space-y-0.5 rounded-md bg-canvas p-2 text-xs text-ink-2">
                        <p>{f.definition}</p><p><strong>Example:</strong> {f.example}</p><p><strong>Not this:</strong> {f.non_example}</p><p><strong>Rule:</strong> {f.decision_rule}</p>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
              {err("labels.findings") && <p className="mt-0.5 text-xs text-danger">{err("labels.findings")}</p>}
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium">Rubric scores <span className="text-danger" aria-hidden>*</span></legend>
              <p className="text-xs text-ink-2">1 = poor, 5 = excellent. Hover a score for its anchor. No overall score is computed.</p>
              <div className="mt-1 space-y-2">
                {rubric.dimensions.map((d) => (
                  <div key={d.key} role="radiogroup" aria-labelledby={`dim-${d.key}`} className="flex flex-wrap items-center gap-1">
                    <span id={`dim-${d.key}`} title={d.definition} className="w-28 shrink-0 text-sm">{d.label}</span>
                    {([1, 2, 3, 4, 5] as const).map((n) => (
                      <label key={n} title={d.anchors[String(n) as "1"]} className={cn("flex size-8 cursor-pointer items-center justify-center rounded-md border text-sm tabular-nums has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand", labels.rubric_scores[d.key] === n ? "border-brand bg-brand text-white" : "border-line hover:bg-canvas")}>
                        <input type="radio" name={`rubric-${d.key}`} checked={labels.rubric_scores[d.key] === n} onChange={() => set("rubric_scores", { ...labels.rubric_scores, [d.key]: n })} className="sr-only" />{n}
                        <span className="sr-only">: {d.anchors[String(n) as "1"]}</span>
                      </label>
                    ))}
                    {d.allow_na && (
                      <label className={cn("flex h-8 cursor-pointer items-center rounded-md border px-2 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand", labels.rubric_scores[d.key] === "na" ? "border-brand bg-brand text-white" : "border-line")}>
                        <input type="radio" name={`rubric-${d.key}`} checked={labels.rubric_scores[d.key] === "na"} onChange={() => set("rubric_scores", { ...labels.rubric_scores, [d.key]: "na" })} className="sr-only" />N/A
                      </label>
                    )}
                    {err(`labels.rubric_scores.${d.key}`) && <p className="w-full text-xs text-danger">{err(`labels.rubric_scores.${d.key}`)}</p>}
                  </div>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="confidence" className="text-sm font-medium">Your confidence <span className="text-danger" aria-hidden>*</span>: <span className="tabular-nums">{confidence === null ? "not set" : confidence.toFixed(2)}</span></label>
              <input id="confidence" type="range" min={0} max={1} step={0.05} value={confidence ?? 0.5} onChange={(e) => setConfidence(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-brand)]" />
              {confidence === null && <p className="text-xs text-ink-2">Move the slider to set a value.</p>}
              {err("confidence") && <p className="text-xs text-danger">{err("confidence")}</p>}
            </div>

            <div>
              <label htmlFor="rationale" className="text-sm font-medium">Rationale <span className="text-danger" aria-hidden>*</span></label>
              <p className="text-xs text-ink-2">Explain your verdict using case facts. Distinguish omissions, false claims and unsafe recommendations. State uncertainty.</p>
              <textarea id="rationale" rows={5} value={rationale} onChange={(e) => setRationale(e.target.value)} aria-invalid={!!err("rationale")} className={`${inputClasses} mt-1`} />
              {err("rationale") && <p className="text-xs text-danger">{err("rationale")}</p>}
            </div>

            <div>
              <label htmlFor="escalation" className="text-sm font-medium">Escalation recommendation</label>
              <p className="text-xs text-ink-2">Required for missed red flags, insufficient escalation or critical severity.</p>
              <textarea id="escalation" rows={2} value={labels.escalation_recommendation} onChange={(e) => set("escalation_recommendation", e.target.value)} className={`${inputClasses} mt-1`} />
              {err("labels.escalation_recommendation") && <p className="text-xs text-danger">{err("labels.escalation_recommendation")}</p>}
            </div>

            <fieldset>
              <legend className="text-sm font-medium">Flag the question itself</legend>
              <div className="mt-1 space-y-1">
                {taxonomy.question_flags.map((q) => (
                  <label key={q.key} className="flex items-start gap-2 text-sm" title={q.definition}>
                    <input type="checkbox" checked={labels.question_flags.includes(q.key)} onChange={() => set("question_flags", toggle(labels.question_flags, q.key))} className="mt-0.5 size-4 accent-[var(--color-brand)]" />{q.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2 rounded-lg border border-line p-3">
              <legend className="px-1 text-sm font-medium">Clinical reference (optional)</legend>
              <p className="text-xs text-ink-2">Required with a date if you claim a guideline-based correction. Entered references are shown as <strong>user-entered, not verified</strong>. Never invent citations.</p>
              <input aria-label="Citation" placeholder="Citation (source, section)" value={labels.reference.citation} onChange={(e) => set("reference", { ...labels.reference, citation: e.target.value })} className={inputClasses} />
              <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                <input aria-label="Reference URL" placeholder="https://…" value={labels.reference.url} onChange={(e) => set("reference", { ...labels.reference, url: e.target.value })} className={inputClasses} />
                <input aria-label="Reference date" placeholder="Date (e.g. 2024-03)" value={labels.reference.reference_date} onChange={(e) => set("reference", { ...labels.reference, reference_date: e.target.value })} className={inputClasses} />
              </div>
              {(err("labels.reference.reference_date") || err("labels.reference.url")) && <p className="text-xs text-danger">{err("labels.reference.reference_date")} {err("labels.reference.url")}</p>}
            </fieldset>

            <Notice tone="info">Submitting locks this revision. It then goes to an independent reviewer; if changes are requested you will work on a new linked revision.</Notice>
          </div>
        </Card>
      </div>
    </div>
  );
}
