import type { Metadata } from "next";
import { Users } from "lucide-react";
import { ActivityList } from "@/components/workflows/activity-list";
import { Badge, buttonClasses, Card, CardHeader, inputClasses, PageHeader } from "@/components/ui/primitives";
import { CAPABILITIES, ROLE_DESCRIPTIONS, ROLES } from "@/lib/permissions/roles";
import { pageQuery } from "@/lib/server/context";
import { listAuditEvents } from "@/lib/services/activity";
import { listMembers, listProjects } from "@/lib/services/projects";

export const metadata: Metadata = { title: "Team & Audit" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const sp = await searchParams;
  const d = await pageQuery(async (tx) => {
    const projects = await listProjects(tx, { includeArchived: true });
    const project = projects.find((p) => p.id === sp.project) ?? projects[0];
    return { projects, project, members: project ? await listMembers(tx, project.id) : [], events: await listAuditEvents(tx, { projectId: project?.id, limit: 100 }) };
  });
  return (
    <>
      <PageHeader title="Team & Audit" icon={<Users className="size-6" />} description="Project roles, the permission matrix enforced on the server, and the append-only audit log." />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-ink-2">Project
          <select name="project" defaultValue={d.project?.id} className={`${inputClasses} mt-0.5 w-auto min-w-[260px]`}>{d.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <button className={buttonClasses("secondary")} type="submit">Switch</button>
      </form>
      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Members" subtitle="Demo personas are simulated; no credentials are claimed or verified." />
            <ul className="divide-y divide-line">{d.members.map((m) => (
              <li key={`${m.user_id}-${m.role}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span>{m.display_name} {m.is_demo_persona && <Badge tone="violet">Simulated</Badge>}</span><Badge>{m.role}</Badge>
              </li>))}</ul>
          </Card>
          <Card className="overflow-x-auto">
            <CardHeader title="Permission matrix" />
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-canvas text-left text-xs text-ink-2"><tr><th className="px-3 py-1.5 font-medium">Capability</th>{ROLES.map((r) => <th key={r} className="px-1 font-medium">{r}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{Object.entries(CAPABILITIES).map(([cap, roles]) => (
                <tr key={cap}><td className="px-3 py-1.5">{cap.replace(/_/g, " ")}</td>{ROLES.map((r) => <td key={r} className="px-1 text-center">{(roles as readonly string[]).includes(r) ? <span aria-label="allowed">✓</span> : <span className="text-ink-2/50" aria-label="not allowed">–</span>}</td>)}</tr>
              ))}</tbody>
            </table>
            <ul className="space-y-1 border-t border-line p-3 text-xs text-ink-2">{ROLES.map((r) => <li key={r}><strong className="text-ink">{r}:</strong> {ROLE_DESCRIPTIONS[r]}</li>)}</ul>
          </Card>
        </div>
        <Card>
          <CardHeader title="Audit log" subtitle="Append-only: the database rejects updates and deletes" />
          <ActivityList events={d.events} />
        </Card>
      </div>
    </>
  );
}
