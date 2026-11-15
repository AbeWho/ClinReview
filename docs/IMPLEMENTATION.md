# Implementation checklist

Items are checked **only** when verified by automated tests (U = unit, I = integration against real Postgres, E = Playwright end-to-end) or a recorded manual check (M).

Last verified 2026-11-15: `typecheck` ✓ · `lint` ✓ · `test` 80/80 ✓ · `build` ✓ · `test:e2e` 7/7 ✓

**Status:** Milestones 0–6 are complete locally, except two items deliberately deferred: Supabase Auth (waiting on the Supabase step) and route loading skeletons (blocked by a framework bug, see below).

## Milestone 0: Bootstrap and documentation
- [x] Next.js 15 + TypeScript strict + Tailwind 4 + ESLint + Vitest + Playwright
- [x] `.env.example`, `.gitignore` (`.env.local`, `.data/` ignored), `.nvmrc` (22)
- [x] README, THREAT_MODEL, ANNOTATION_GUIDE, DATA_DICTIONARY, DEMO_SCRIPT
- [x] One-command local boot with auto-migrate and auto-seed (E, M)

## Milestone 1: Design system and navigation
- [x] Sidebar, mobile menu, workflow stepper, status chips, cards, forms, empty states, error boundary (M)
- [x] Disclaimer bar on every workspace page; "Demo data" and "Simulated" badges (M)
- [x] No fabricated KPIs; dashboard counts are queries over records (I)
- [ ] **Deferred:** route loading skeletons. On Next 15.5.29, `loading.tsx` (group-level *and* per-route) broke client navigation into dynamic routes and lost server-action refreshes on those pages. Both were caught by E2E and reverted. Revisit after a Next.js upgrade; the previous page simply stays visible while the next one loads.

## Milestone 2: Auth, database, roles
- [x] SQL migrations, UUIDs, timestamptz, check constraints, composite tenant FKs
- [x] RLS on every table; requests run as restricted role `clinreview_app` (I)
- [x] Immutability triggers: prompt versions, responses, submitted annotations, reviews, adjudications, exports, audit; cases frozen once prompted; cases never deleted (I)
- [x] Review and adjudication independence triggers (I)
- [x] Signed httpOnly demo session, server-verified; off in production unless enabled (E)
- [x] Audit events written in the same transaction as each change (I)
- [ ] **Deferred (owner request):** Supabase Auth with real accounts. Done during the Supabase step

## Milestone 3: Project → case → prompt → response
- [x] Create, **edit** and archive projects; add/remove members (I, E)
- [x] Taxonomy/rubric version locked once annotations exist (service + DB trigger) (I, E)
- [x] Synthetic case intake with identifier screen and duplicate hash (I, E)
- [x] **Case editing** until a prompt exists; re-attestation and re-screening; frozen afterwards (service + DB trigger) (I, E)
- [x] **Bulk CSV/JSONL import**: dry-run preview, per-row errors, extension/MIME/size/row limits, UTF-8/NFC normalization, duplicates within the file and against the project, case-group keys, single-transaction commit of valid rows (U, I, E)
- [x] Prompt templates, context checklist, immutable versions with optimistic concurrency (I, E)
- [x] Manual model response with provenance behind `ModelProvider` (I, E)
- [x] New case → queued task with no SQL console (I, E)

## Milestone 4: Labeling
- [x] Queue filters, assign/unassign, next/previous, "needs my labeling" shared with dashboard KPI (I, E)
- [x] Three-pane workspace; evidence by selection or exact quote (E)
- [x] Full taxonomy, rubric (with N/A), confidence, rationale, escalation, question flags, references (E)
- [x] Debounced autosave, save status, conflict detection, unload warning (I, E)
- [x] Submit validation; duplicate submit blocked (I, E)

## Milestone 5: Review and QA
- [x] Review queue excludes own work; decisions with required comments and checklist (I, E)
- [x] Linked revisions; superseded originals preserved (I, E)
- [x] Disagreement (verdict OR severity) → adjudication; agreement → consensus (U, I)
- [x] Side-by-side comparison, highlighted differences, rubric deltas, reconciliation note (E)

## Milestone 6: Exports and reports
- [x] Eligibility gate with reasons (I, E)
- [x] Deterministic case-group splits; DB enforces one split per group per export (U, I)
- [x] Schema-validated JSONL; CSV with formula-injection escaping; manifest + sha256 (U, I, E)
- [x] Immutable semver export versions; authorized download (401 without session) (I, E)
- [x] Server-side rate limits on expensive operations: export generation 5/min, import 20/min per user (U). In-memory, per process
- [x] Reports from live records, with κ and n (I, M)

## Milestone 7: Portfolio readiness (not started beyond basics)
- [x] Demo seed reaches every lifecycle state through services (I)
- [x] README screenshots of implemented features (M)
- [x] Baseline accessibility: labels, skip link, focus rings, aria-live status, keyboard evidence entry (M)
- [ ] Full accessibility audit (axe + screen reader)
- [ ] Supabase project connection + Supabase Auth (step-by-step with the owner)
- [ ] Deployed preview on Vercel (step-by-step with the owner)
- [ ] Taxonomy/rubric version editor UI; shared-store rate limiting for multi-instance deploys

## Decisions log
1. PGlite for local dev (no Docker or Supabase CLI; macOS 13.0). The same SQL runs on hosted Postgres via `DATABASE_URL`.
2. App session + Postgres RLS via `SET LOCAL ROLE`; policies call `app.uid()`.
3. `task_assignments` replaces `tasks.assignee_id` (two independent annotators).
4. Task status is derived (`deriveTaskState`), never written by clients.
5. Consensus: two approved annotations agree iff verdict and severity match; final labels then come from the earliest submission.
6. Playwright pinned to 1.55.1 (later versions drop macOS 13 browser support).
7. Migrations are append-only: applied files are never edited; changes go in a new numbered file (e.g. `0003_case_and_project_editing.sql`).
8. Cases freeze once a prompt references them, so every response keeps pointing at the exact scenario it answered.
9. Import commits valid rows and skips invalid ones (reported in the preview), inside one transaction, rather than all-or-nothing.
