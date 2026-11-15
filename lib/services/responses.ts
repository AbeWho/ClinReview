import type { Tx } from "@/lib/db/types";
import { ManualResponseProvider } from "@/lib/providers/model-provider";
import { ResponseInputSchema } from "@/lib/validation/forms";
import { audit, one, parseOrThrow, requireActiveProject, requireCapability, type Actor } from "./core";

export interface ResponseRow {
  id: string;
  project_id: string;
  prompt_version_id: string;
  version_number: number;
  provider: string;
  model_name: string;
  model_version: string;
  generation_settings: Record<string, unknown>;
  response_text: string;
  origin: "manual" | "provider" | "seed";
  generated_at: Date | null;
  created_at: Date;
  created_by_name: string;
  task_id: string | null;
  task_status: string | null;
}

export async function listResponsesForCase(tx: Tx, caseId: string): Promise<ResponseRow[]> {
  return tx.query<ResponseRow>(
    `select r.*, v.version_number, u.display_name as created_by_name, t.id as task_id, t.status as task_status
     from model_responses r
     join prompt_versions v on v.id = r.prompt_version_id
     join prompts pr on pr.id = v.prompt_id
     join profiles u on u.id = r.created_by
     left join tasks t on t.response_id = r.id
     where pr.case_id = $1 order by r.created_at desc`,
    [caseId],
  );
}

/** Attach an immutable model response to a specific prompt version, recording full provenance. */
export async function attachResponse(tx: Tx, actor: Actor, input: unknown, opts: { origin?: "manual" | "seed" } = {}) {
  const data = parseOrThrow(ResponseInputSchema, input);
  const pv = await one(tx.query<{ project_id: string; prompt_text: string }>("select project_id, prompt_text from prompt_versions where id = $1", [data.prompt_version_id]), "Prompt version");
  await requireCapability(tx, pv.project_id, actor, "author_content");
  await requireActiveProject(tx, pv.project_id);

  const provider = new ManualResponseProvider(opts.origin ?? "manual");
  const result = await provider.generate({ promptText: pv.prompt_text, ...data });

  const [row] = await tx.query<{ id: string }>(
    `insert into model_responses (project_id, prompt_version_id, provider, model_name, model_version, generation_settings, response_text, origin, generated_at, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [pv.project_id, data.prompt_version_id, result.provider, result.model_name, result.model_version, JSON.stringify(result.generation_settings), result.response_text, result.origin, result.generated_at, actor.id],
  );
  await audit(tx, actor, {
    projectId: pv.project_id, entityType: "model_response", entityId: row!.id, action: "response.attached",
    after: { prompt_version_id: data.prompt_version_id, model: `${result.model_name}@${result.model_version}`, origin: result.origin },
  });
  return row!.id;
}
