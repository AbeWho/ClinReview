import type { Scenario } from "@/lib/validation/case";
import { humanize } from "@/components/ui/primitives";

const List = ({ items }: { items: string[] }) => (items.length ? <ul className="list-disc space-y-0.5 pl-4">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <span className="text-ink-2">None listed</span>);

/** Read-only structured view of a synthetic case. Text is rendered as plain text (never as HTML). */
export function CaseSummary({ scenario, compact }: { scenario: Scenario; compact?: boolean }) {
  const v = scenario.vitals;
  const vitals = [v.bp && `BP ${v.bp}`, v.hr && `HR ${v.hr}`, v.rr && `RR ${v.rr}`, v.spo2 && `SpO₂ ${v.spo2}`, v.temp_c && `Temp ${v.temp_c} °C`].filter(Boolean);
  const rows: [string, React.ReactNode][] = [
    ["Patient", `${scenario.age_band} age band · ${humanize(scenario.sex)}`],
    ["Chief complaint", scenario.chief_complaint],
    ["HPI", scenario.hpi],
    ...(scenario.past_history ? [["History", scenario.past_history] as [string, React.ReactNode]] : []),
    ["Comorbidities", <List key="c" items={scenario.comorbidities} />],
    ["Medications", <List key="m" items={scenario.medications} />],
    ["Allergies", <List key="a" items={scenario.allergies} />],
    ["Vitals", vitals.length ? vitals.join(" · ") : <span className="text-ink-2">Not recorded</span>],
    ["Labs", <List key="l" items={scenario.labs} />],
    ...(scenario.social_factors ? [["Social factors", scenario.social_factors] as [string, React.ReactNode]] : []),
  ];
  return (
    <dl className={compact ? "space-y-2 text-sm" : "grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[140px_1fr]"}>
      {rows.map(([k, val]) => (
        <div key={k} className={compact ? "" : "contents"}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-2 sm:pt-0.5">{k}</dt>
          <dd className="whitespace-pre-wrap break-words text-ink">{val}</dd>
        </div>
      ))}
    </dl>
  );
}
