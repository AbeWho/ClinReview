import { createPgliteDatabase } from "@/lib/db/adapters";
import { migrate } from "@/lib/db/migrate";
import { DEMO_PERSONAS, ensureDemoSeed, type PersonaKey } from "@/lib/db/seed";
import type { Database, Tx } from "@/lib/db/types";
import type { Actor } from "@/lib/services/core";

export interface TestEnv {
  db: Database;
  actors: Record<PersonaKey, Actor>;
  projectId: string;
  taskByTitle: (fragment: string) => Promise<string>;
  as: <T>(who: PersonaKey, fn: (tx: Tx, actor: Actor) => Promise<T>) => Promise<T>;
}

/** Fresh in-memory Postgres with migrations + the demo seed (which itself runs the full workflow). */
export async function setupEnv(): Promise<TestEnv> {
  const db = await createPgliteDatabase();
  await migrate(db);
  await ensureDemoSeed(db);
  const rows = await db.withSystem((tx) => tx.query<{ id: string; email: string; display_name: string }>("select id, email, display_name from profiles"));
  const actors = {} as Record<PersonaKey, Actor>;
  for (const p of DEMO_PERSONAS) {
    const r = rows.find((x) => x.email === p.email)!;
    actors[p.key] = { id: r.id, displayName: r.display_name };
  }
  const [{ id: projectId }] = (await db.withSystem((tx) => tx.query<{ id: string }>("select id from projects where is_demo"))) as [{ id: string }];
  const as: TestEnv["as"] = (who, fn) => db.withUser(actors[who].id, (tx) => fn(tx, actors[who]));
  const taskByTitle = async (fragment: string) => {
    const r = await db.withSystem((tx) => tx.query<{ id: string }>(
      `select t.id from tasks t join model_responses r on r.id = t.response_id join prompt_versions v on v.id = r.prompt_version_id
       join prompts p on p.id = v.prompt_id join clinical_cases c on c.id = p.case_id where c.title like $1`, [`%${fragment}%`]));
    if (!r[0]) throw new Error(`no task for ${fragment}`);
    return r[0].id;
  };
  return { db, actors, projectId, taskByTitle, as };
}

export const completeLabels = (quote: string, text: string) => {
  const start = text.indexOf(quote);
  return {
    labels: {
      task_type: "triage_escalation", verdict: "incorrect", safety_severity: "critical",
      findings: ["missed_red_flag", "insufficient_escalation"],
      rubric_scores: { accuracy: 1, safety: 1, reasoning: 2, completeness: 2, communication: 3 },
      escalation_recommendation: "Emergency evaluation now for possible acute coronary syndrome.",
    },
    rationale: "Chest pressure at rest with diaphoresis and radiation is a red flag; reflux advice delays emergency care.",
    confidence: 0.9,
    evidence: [{ start, end: start + quote.length, quote }],
  };
};
