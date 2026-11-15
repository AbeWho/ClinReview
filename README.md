# ClinReview

**A full-stack workbench for evaluating clinical reasoning in AI model answers**: synthetic case intake, versioned prompts, structured safety annotation with evidence spans, independent review, adjudication of disagreements, and versioned, validated JSONL/CSV dataset exports.

> **For AI evaluation research and education. Not for diagnosis, treatment, or direct patient care.**
> Synthetic data only. ClinReview is an **independent portfolio project**. It is not affiliated with any healthcare organization, it is not HIPAA-certified, and its labels are educational judgments, not validated clinical ground truth.

![Labeling workspace](docs/screenshots/label.png)

## What it does

| Stage | What you can do (all persisted in Postgres) |
|---|---|
| Project setup | Create, edit and archive projects; pin a taxonomy + rubric version (locked once labeling starts); 1 or 2 independent annotations per item; blind mode; members and roles |
| Case intake | Structured synthetic case form or **bulk CSV/JSONL import with a dry-run preview** and per-row errors; identifier screening, duplicate detection; cases are editable until a prompt is built from them |
| Prompt design | Templates filled from case variables, context checklist, **immutable versions** |
| Model response | Attach a prewritten answer with model name, version, settings and origin, pinned to an exact prompt version |
| Labeling | Three-pane workspace: select response text as **evidence spans**; verdict, severity, findings, rubric 1–5/N/A, confidence, rationale, escalation, references; **autosave with conflict detection** |
| Clinical review | An independent reviewer approves, requests changes or rejects; changes create a linked **revision** while the original stays locked |
| QA / adjudication | Side-by-side comparison with highlighted differences and rubric deltas; the adjudicator records final labels plus a reconciliation note; originals preserved |
| Export | Eligibility gate with exclusion reasons, deterministic case-group splits, JSONL + CSV + manifest with sha256 checksum, immutable versions |
| Reports | Live counts by state, verdict/severity/issue distributions, Cohen's κ with n, review turnaround, export readiness |

## Quick start (local, no accounts or Docker needed)

Prerequisites: **Node.js 20.9+ (22 LTS recommended)** and npm.

```bash
git clone <your-repo-url> clinreview && cd clinreview
npm install
cp .env.example .env.local      # optional locally; set SESSION_SECRET for anything shared
npm run dev                     # http://localhost:3000
```

On first start the app creates an embedded Postgres database in `.data/pglite`, runs the SQL migrations in `supabase/migrations/`, and seeds the demo project **through the same service layer the UI uses**. Pick a simulated persona on the sign-in page.

Reset the demo data (stop the dev server first): `npm run db:reset`

> **macOS 13.0 note:** some current Node builds require macOS 13.5+. If `node` crashes with a `dyld` symbol error ("built for macOS 13.5"), install the official Node 22 build from nodejs.org (the version in `.nvmrc`) and put its `bin` folder first on your `PATH`, e.g. `export PATH="$HOME/.local/node22/bin:$PATH"` in `~/.zshrc`.

**Hosted Postgres (e.g. Supabase):** set `DATABASE_URL` (server-side only). Migrations run on boot; set `SEED_DEMO_ON_BOOT=true` to seed the demo. The migrations create a restricted `clinreview_app` role, and the connecting user must be allowed to `SET ROLE` to it.

## Demo walkthrough

See [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md). In short: the **Lead** creates a case, a prompt version, a response and a task → **Annotator A** labels it (refresh mid-way; the draft survives) and submits → the **Reviewer** requests changes → A submits revision 2 → the Reviewer approves → the **Adjudicator** resolves the seeded warfarin disagreement → the **Lead** exports v1.0.0 and opens Reports.

## Roles and permissions

Enforced in the service layer **and** by Postgres Row Level Security.

| Capability | owner | admin | annotator | reviewer | adjudicator | viewer |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| View project data | ✓ | ✓ | ✓¹ | ✓ | ✓ | ✓² |
| Manage project/members | ✓ | ✓ | | | | |
| Author cases, prompts, responses | ✓ | ✓ | | | | |
| Assign tasks | ✓ | ✓ | | | | |
| Annotate (assigned tasks only) | | | ✓ | | | |
| Review (never own work) | | | | ✓ | | |
| Adjudicate (never own work) | | | | | ✓ | |
| Create exports | ✓ | ✓ | | | | |

¹ Blind mode: annotators see only their own annotations (RLS). ² Viewers see annotations only once a task is finalized. Demo personas are labeled *Simulated* everywhere; no credentials are claimed.

## Data lifecycle

```mermaid
flowchart LR
  P[Project] --> C[Synthetic case] --> V[Prompt version<br/>immutable] --> R[Model response<br/>immutable] --> T[Task queued]
  T --> D[Annotation draft<br/>autosave] --> S[Submitted<br/>immutable]
  S --> RV{Independent review}
  RV -- needs changes / reject --> D2[Revision N+1<br/>linked draft] --> S
  RV -- approve, 1 required --> F[Finalized]
  RV -- approve, 2 required --> Q{Agree on verdict<br/>and severity?}
  Q -- yes --> F
  Q -- no --> A[Adjudication<br/>originals preserved] --> F
  F --> X[Export gate] --> E[Export version<br/>JSONL + CSV + manifest]
```

Task status is never set by a client: `lib/workflow/task-status.ts` derives it from the records, and every transition recomputes it inside the same database transaction.

## Architecture

```mermaid
flowchart TB
  B[Browser<br/>React client components] -- server actions / route handlers --> S[Next.js server<br/>session check, Zod validation]
  S --> SV[Service layer lib/services<br/>role checks, transitions, audit]
  SV -- "SET LOCAL ROLE clinreview_app<br/>app.user_id = signed-in user" --> DB[(Postgres<br/>constraints, triggers, RLS)]
```

- **Next.js 15 (App Router) + React 19 + TypeScript (strict) + Tailwind CSS 4**, Lucide icons, Zod.
- **Postgres** through one raw-SQL query layer (`lib/db`). Locally this is **PGlite** (real Postgres compiled to WebAssembly); in production the same migrations run on any Postgres, including Supabase.
- **Defense in depth:** services check roles and states, then Postgres enforces RLS, immutability triggers, review-independence triggers, and composite foreign keys that make cross-project references impossible.
- **Auth (V1):** demo persona sign-in with an HMAC-signed, httpOnly session cookie, verified on every request. It is enabled by default in development and must be explicitly enabled in production (`DEMO_AUTH_ENABLED=true`).

| Decision | Why | Tradeoff |
|---|---|---|
| PGlite locally | Zero-setup boot, no Docker; RLS and triggers are really tested | One writer at a time; demo scale only |
| Signed-cookie demo auth, not Supabase Auth (yet) | No credentials available; spec permits labeled demo auth | Real accounts are future work; `app.uid()` is the single integration point |
| `task_assignments` instead of `tasks.assignee_id` | Two independent annotators per item | One more table |
| Export artifacts stored in the DB | Simple and transactional | Large datasets should move to signed storage URLs |
| No overall rubric score | No documented aggregation formula | Dimensions are read individually |

## Testing

```bash
npm run typecheck   # TypeScript strict
npm run lint        # ESLint
npm run test        # Vitest: unit + integration against real Postgres with RLS
npm run build       # production build
npm run test:e2e    # Playwright: builds, boots a fresh DB, drives the full critical path
```

Covered: state machine; validation rules; prompt/response immutability; draft save/resume and incomplete-submit refusal; concurrency conflicts; evidence offsets; self-review blocked by service **and** DB trigger; blind annotation; cross-project isolation; adjudicator-only adjudication that preserves originals; export exclusions, schema-valid JSONL, reproducible checksums, non-leaking splits; CSV formula-injection escaping; KPIs matching records.

## Deployment

Intended target: Vercel + Supabase (`DATABASE_URL`, `SESSION_SECRET`, `DEMO_AUTH_ENABLED=true`, first boot with `SEED_DEMO_ON_BOOT=true`). **Not deployed or verified yet.**

## Limitations

No real user accounts yet (Supabase Auth is the next step); no taxonomy editor UI; no remote model provider; rate limiting is in-memory per process; the identifier screen is a heuristic, **not** de-identification; seeded labels are fictional and need qualified expert review before any use as ground truth. Details: [IMPLEMENTATION](docs/IMPLEMENTATION.md) · [THREAT_MODEL](docs/THREAT_MODEL.md) · [ANNOTATION_GUIDE](docs/ANNOTATION_GUIDE.md) · [DATA_DICTIONARY](docs/DATA_DICTIONARY.md)

## Screenshots

| | |
|---|---|
| ![Sign in](docs/screenshots/signin.png) | ![Dashboard](docs/screenshots/dashboard.png) |
| ![Adjudication](docs/screenshots/adjudication.png) | ![Reports](docs/screenshots/reports.png) |

## Attribution

Independent portfolio project. Not paid clinical work; not affiliated with or endorsed by any medical organization. All clinical scenarios and model answers are fictional.
