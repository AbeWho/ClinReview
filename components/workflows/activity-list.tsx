import type { AuditRow } from "@/lib/services/activity";
import { formatDate, humanize } from "@/components/ui/primitives";

const describe = (e: AuditRow) => {
  const a = (e.after_summary ?? {}) as Record<string, unknown>;
  const b = (e.before_summary ?? {}) as Record<string, unknown>;
  switch (e.action) {
    case "task.status_changed": return `Task moved ${humanize(String(b.status ?? "?"))} → ${humanize(String(a.status ?? "?"))}${a.finalized_via ? ` (via ${a.finalized_via})` : ""}`;
    case "annotation.submitted": return `Submitted annotation r${a.revision}: ${humanize(String(a.verdict ?? ""))}, severity ${a.severity}`;
    case "prompt.version_saved": return `Saved prompt version ${a.version}`;
    case "export.created": return `Created export v${a.version} (${a.record_count} records)`;
    case "export.downloaded": return `Downloaded export (${a.format})`;
    case "member.added": return `Added member as ${a.role}`;
    case "case.created": return `Created case “${a.title}”`;
    default: return humanize(e.action.replace(".", " "));
  }
};

export function ActivityList({ events, showProject }: { events: AuditRow[]; showProject?: boolean }) {
  if (!events.length) return <p className="px-4 py-6 text-sm text-ink-2">No activity yet.</p>;
  return (
    <ol className="divide-y divide-line">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm">
          <span className="min-w-0">
            <span className="font-medium">{e.actor_name}</span> <span className="text-ink-2">·</span> {describe(e)}
            {showProject && e.project_name && <span className="text-ink-2"> · {e.project_name}</span>}
          </span>
          <time className="text-xs text-ink-2" dateTime={new Date(e.created_at).toISOString()}>{formatDate(e.created_at)}</time>
        </li>
      ))}
    </ol>
  );
}
