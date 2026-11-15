import type { Tx } from "@/lib/db/types";
import { PromptVersionInputSchema } from "@/lib/validation/forms";
import { AppError, audit, one, parseOrThrow, requireActiveProject, requireCapability, type Actor } from "./core";

export interface PromptVersionRow {
  id: string;
  prompt_id: string;
  version_number: number;
  prompt_text: string;
  template_key: string | null;
  created_by_name: string;
  created_at: Date;
  response_count: number;
}

export interface PromptRow {
  id: string;
  project_id: string;
  case_id: string;
  title: string;
  tags: string[];
  current_version_id: string | null;
}

export async function getPromptForCase(tx: Tx, caseId: string) {
  const [prompt] = await tx.query<PromptRow>("select * from prompts where case_id = $1 order by created_at limit 1", [caseId]);
  if (!prompt) return null;
  const versions = await tx.query<PromptVersionRow>(
    `select v.*, u.display_name as created_by_name,
       (select count(*)::int from model_responses r where r.prompt_version_id = v.id) as response_count
     from prompt_versions v join profiles u on u.id = v.created_by
     where v.prompt_id = $1 order by v.version_number desc`,
    [prompt.id],
  );
  return { prompt, versions };
}

export async function listPrompts(tx: Tx) {
  return tx.query<{
    id: string; title: string; tags: string[]; case_id: string; case_title: string; project_name: string;
    version_number: number | null; version_count: number; updated_at: Date;
  }>(
    `select pr.id, pr.title, pr.tags, pr.case_id, c.title as case_title, p.name as project_name, pr.updated_at,
       v.version_number, (select count(*)::int from prompt_versions x where x.prompt_id = pr.id) as version_count
     from prompts pr join clinical_cases c on c.id = pr.case_id join projects p on p.id = pr.project_id
     left join prompt_versions v on v.id = pr.current_version_id
     order by pr.updated_at desc limit 200`,
  );
}

/**
 * Prompt versions are immutable (DB trigger). "Editing" always creates version N+1, so any model
 * response keeps pointing at the exact text it answered. `based_on_version` gives optimistic
 * concurrency: if someone saved a newer version meanwhile, we refuse instead of silently forking.
 */
export async function savePromptVersion(tx: Tx, actor: Actor, input: unknown) {
  const data = parseOrThrow(PromptVersionInputSchema, input);
  const c = await one(tx.query<{ project_id: string; title: string }>("select project_id, title from clinical_cases where id = $1", [data.case_id]), "Case");
  await requireCapability(tx, c.project_id, actor, "author_content");
  await requireActiveProject(tx, c.project_id);

  let existing = await getPromptForCase(tx, data.case_id);
  if (!existing) {
    await tx.query("insert into prompts (project_id, case_id, title, tags, created_by) values ($1,$2,$3,$4,$5)", [c.project_id, data.case_id, `Prompt: ${c.title}`.slice(0, 160), data.tags, actor.id]);
    existing = await getPromptForCase(tx, data.case_id);
  }
  const { prompt, versions } = existing!;
  const latest = versions[0]?.version_number ?? 0;
  if (data.based_on_version !== latest) {
    throw new AppError("conflict", `Version ${latest} was saved after you started editing. Reload to see it before saving a new version.`);
  }
  if (versions[0] && versions[0].prompt_text === data.prompt_text) {
    throw new AppError("invalid", "No changes since the current version.");
  }
  const [v] = await tx.query<{ id: string; version_number: number }>(
    `insert into prompt_versions (project_id, prompt_id, version_number, prompt_text, template_key, template_metadata, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning id, version_number`,
    [c.project_id, prompt.id, latest + 1, data.prompt_text, data.template_key, JSON.stringify({ tags: data.tags }), actor.id],
  );
  await tx.query("update prompts set current_version_id = $2, tags = $3, updated_at = now() where id = $1", [prompt.id, v!.id, data.tags]);
  await audit(tx, actor, { projectId: c.project_id, entityType: "prompt_version", entityId: v!.id, action: "prompt.version_saved", after: { prompt_id: prompt.id, version: v!.version_number } });
  return v!;
}
