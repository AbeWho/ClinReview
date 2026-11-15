import type { AnnotationRow } from "@/lib/services/annotations";
import type { RubricDefinition, TaxonomyDefinition } from "@/lib/taxonomy/schema";
import { Badge, formatDate, humanize } from "@/components/ui/primitives";
import { DecisionChip, SeverityChip, VerdictChip } from "@/components/ui/status";

/** Read-only rendering of one annotation revision (used by review, adjudication and history). */
export function AnnotationView({ a, taxonomy, rubric, highlight }: { a: Pick<AnnotationRow, "labels_json" | "rationale" | "confidence" | "evidence" | "revision" | "status" | "submitted_at" | "annotator_name" | "review">; taxonomy: TaxonomyDefinition; rubric: RubricDefinition; highlight?: Set<string> }) {
  const l = a.labels_json;
  const label = (key: string, list: { key: string; label: string }[]) => list.find((x) => x.key === key)?.label ?? humanize(key);
  const hl = (k: string) => (highlight?.has(k) ? "rounded bg-warn-pale ring-1 ring-warn/40 px-1 -mx-1" : "");
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{a.annotator_name}</span>
        <Badge>Revision {a.revision}</Badge>
        <Badge tone={a.status === "submitted" ? "brand" : a.status === "superseded" ? "neutral" : "info"}>{humanize(a.status)}</Badge>
        {a.submitted_at && <span className="text-xs text-ink-2">submitted {formatDate(a.submitted_at)}</span>}
      </div>
      <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-ink-2">Task type</dt><dd className={hl("task_type")}>{l.task_type ? label(l.task_type, taxonomy.task_types) : "—"}</dd>
        <dt className="text-ink-2">Verdict</dt><dd className={hl("verdict")}><VerdictChip verdict={l.verdict} /></dd>
        <dt className="text-ink-2">Severity</dt><dd className={hl("safety_severity")}><SeverityChip severity={l.safety_severity} /></dd>
        <dt className="text-ink-2">Findings</dt><dd className={hl("findings")}><div className="flex flex-wrap gap-1">{(l.findings ?? []).map((f) => <Badge key={f} tone={f === "clinically_correct" ? "ok" : "warn"}>{label(f, taxonomy.findings)}</Badge>)}</div></dd>
        <dt className="text-ink-2">Confidence</dt><dd className={hl("confidence")}>{a.confidence ?? "—"}</dd>
        {(l.question_flags ?? []).length > 0 && <><dt className="text-ink-2">Question flags</dt><dd>{l.question_flags!.map((q) => label(q, taxonomy.question_flags)).join(", ")}</dd></>}
        {l.escalation_recommendation && <><dt className="text-ink-2">Escalation</dt><dd className="whitespace-pre-wrap">{l.escalation_recommendation}</dd></>}
      </dl>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Rubric (1–5)</p>
        <ul className={`mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3 ${hl("rubric_scores")}`}>
          {rubric.dimensions.map((d) => <li key={d.key} className="flex justify-between gap-2"><span className="text-ink-2">{d.label}</span><span className="font-medium tabular-nums">{l.rubric_scores?.[d.key] === "na" ? "N/A" : l.rubric_scores?.[d.key] ?? "—"}</span></li>)}
        </ul>
        <p className="mt-1 text-xs text-ink-2">No overall score: the rubric has no documented aggregation formula.</p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Rationale</p>
        <p className="mt-0.5 whitespace-pre-wrap">{a.rationale || "—"}</p>
      </div>
      {a.evidence.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Evidence ({a.evidence.length})</p>
          <ul className="mt-1 space-y-1">
            {a.evidence.map((e) => (
              <li key={e.id} className="rounded-md border-l-2 border-warn bg-warn-pale/50 px-2 py-1">
                <q className="italic">{e.quote_snapshot}</q> {e.issue_category && <span className="text-xs text-ink-2">· {label(e.issue_category, taxonomy.findings)}</span>}
                {e.notes && <p className="text-xs text-ink-2">{e.notes}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {l.reference?.citation && (
        <div className="rounded-md border border-line bg-canvas px-2 py-1.5">
          <p className="text-xs font-semibold text-ink-2">Reference (user-entered, <strong>not verified</strong> by ClinReview)</p>
          <p>{l.reference.citation} {l.reference.reference_date && <span className="text-ink-2">({l.reference.reference_date})</span>}</p>
          {l.reference.url && <a href={l.reference.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-xs text-brand underline">{l.reference.url}</a>}
        </div>
      )}
      {a.review && (
        <div className="rounded-md border border-line px-2 py-1.5">
          <p className="flex flex-wrap items-center gap-2 text-xs text-ink-2">Review by <strong className="text-ink">{a.review.reviewer_name}</strong> <DecisionChip decision={a.review.decision} /> {formatDate(a.review.created_at)}</p>
          {a.review.comments && <p className="mt-1 whitespace-pre-wrap">{a.review.comments}</p>}
        </div>
      )}
    </div>
  );
}
