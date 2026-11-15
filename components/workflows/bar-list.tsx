/**
 * Single-series horizontal bar list. One hue (brand teal); labels and values stay in text ink,
 * so identity and magnitude are never conveyed by color alone. Each row is also a readable
 * "label: value" line for screen readers (the list doubles as the table view).
 */
export function BarList({ title, data, labels, order, total, emptyText = "No data yet." }: {
  title: string; data: Record<string, number>; labels?: Record<string, string>; order?: string[]; total?: number; emptyText?: string;
}) {
  const keys = order ? order : Object.keys(data).sort((a, b) => (data[b] ?? 0) - (data[a] ?? 0));
  const rows = keys.map((k) => ({ key: k, value: data[k] ?? 0 })).filter((r) => order || r.value > 0);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const sum = total ?? rows.reduce((a, r) => a + r.value, 0);
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-medium text-ink">{title} <span className="font-normal text-ink-2">(n = {sum})</span></figcaption>
      {sum === 0 ? <p className="text-sm text-ink-2">{emptyText}</p> : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const label = labels?.[r.key] ?? r.key.replace(/_/g, " ");
            const pct = sum ? Math.round((r.value / sum) * 100) : 0;
            return (
              <li key={r.key} className="grid grid-cols-[minmax(120px,38%)_1fr_auto] items-center gap-2 text-sm" title={`${label}: ${r.value} (${pct}%)`}>
                <span className="truncate capitalize text-ink-2">{label}</span>
                <span className="h-2.5 rounded-sm bg-canvas" aria-hidden>
                  <span className="block h-full rounded-r-[4px] bg-brand" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 3 : 0 }} />
                </span>
                <span className="w-16 text-right tabular-nums text-ink">{r.value} <span className="text-xs text-ink-2">{pct}%</span></span>
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}
