# CLAUDE.md

## Project: ClinReview

**Purpose:** Build a real, demonstrable, end-to-end medical AI evaluation and labeling web application, suitable for a nursing student or early-career healthcare professional to showcase as a technical portfolio project. The product should demonstrate practical clinical reasoning evaluation, dataset creation, structured annotation, human review, QA/adjudication, and reproducible exports.

**Owner context:** The owner has nursing education/background and is developing software engineering skills. Explain engineering decisions in plain English, but implement production-quality patterns. Do not require advanced prior GitHub knowledge. This project is a learning and portfolio tool, **not** a clinical decision-support system or a substitute for licensed clinical judgment.

**Working name:** ClinReview

**North star:** A visitor can open a seeded demo project, inspect a synthetic clinical case, create or edit its prompt, view a saved model answer, label issues and evidence, submit the annotation, review or adjudicate it using a second account/role, and export a versioned, validated JSONL dataset. These steps must work through the UI and persist in the database. A screenshot-only UI is not sufficient.

---

## 1. How Claude Code should work

1. **Inspect before changing.** Read this file, `README.md`, `package.json`, current directory tree, environment examples, migrations, and tests. If a repo exists, adapt to it rather than overwriting working code.
2. **Plan the smallest complete vertical slice** before coding. Implement a usable path across the application instead of making every screen decorative.
3. **Use progressive milestones** in the order below. After each milestone, run typecheck, lint, tests and build, fix regressions, then summarize what actually works.
4. **Do not claim functionality until verified.** No fabricated dashboards, reviews, model calls, clinical citations, user counts, QA rates or dataset version histories. Demo metrics must be clearly labeled as seeded/sample data and calculated from records.
5. **Prefer maintainable code.** Strict TypeScript, small reusable components, schema validation, migrations, and tests. Avoid unnecessary abstractions, premature microservices, and enormous single-file components.
6. **Preserve users' work.** Use durable persistence, safe updates, review ownership, audit events, draft autosave, and explicit confirmation for destructive operations.
7. **Teach while building.** At the end of each milestone, explain key files, how to run them, what was tested, and one concept the owner should understand. Keep it concise and practical.
8. **Ask only when truly blocked.** Make sensible reversible decisions and document assumptions. Never invent secrets or deploy without permission.
9. **Keep a running implementation checklist** in `docs/IMPLEMENTATION.md`, marking completed items only after manual or automated verification.
10. **Security and clinical integrity take priority** over visual polish and feature count.

## 2. Success criteria / acceptance demo

A successful V1 must support this complete journey:

1. Sign in to a demo account (or use clearly marked local demo auth in development).
2. Create a project such as **Heart Failure Reasoning Evaluation**, specifying scope, taxonomy version, rubric, reviewer requirements, and dataset goals.
3. Add a **fully synthetic** case with chief complaint, history, comorbidities, medications, allergies, vitals, labs, and scenario source/provenance.
4. Draft a clinical reasoning prompt from that case, edit it, and save a version.
5. Attach a **prewritten example model response** manually or optionally call a provider through a server-side adapter. Record model name, version, parameters, prompt version, timestamp, and whether it was imported/generated.
6. Assign the response to a labeler. Present the case, prompt, and response side by side with explicit safety taxonomy, severity, rubric, evidence spans, and rationale fields.
7. Save a partial draft and resume it. Submit a completed annotation; validate required fields.
8. Have a separate reviewer assess the annotation, accept it, or send it back with actionable comments.
9. Demonstrate two independent labels with a disagreement, then adjudicate the final verdict while preserving both original records.
10. Export only eligible, finalized items as **versioned JSONL and CSV**, including provenance, schema version, audit trail references, prompt/response/label content, and train/validation/test assignments.
11. Inspect project reports showing **real calculated** completion, disagreement, safety issue distribution, and export readiness.
12. Complete the demo on a deployed preview or local environment with no broken buttons, no seeded fake users masquerading as real clinicians, and no real patient data.

**Definition of done:** Critical actions work, database state survives refresh and sign-in, role restrictions are enforced on the server, a new developer can follow the README, and tests cover key lifecycle transitions.

---

## 3. Product design system and screen map

Use the two conversation mockups as visual references **if accessible in the working directory**. Do not assume the image files are in the repo. If they aren't available, use the description below.

**Visual direction:** Premium, restrained healthcare SaaS. White/off-white surfaces, light borders, subtle shadows, teal/blue accents, rounded cards, readable dense data layouts, clear status colors, and excellent hierarchy. Avoid gaudy gradients, decorative charts without real data, oversized empty KPI cards, and stereotypical AI-generated landing-page aesthetics.

**Design tokens (suggested):**
- Brand teal `#087F8C`, dark teal `#066674`, pale teal `#E8F6F7`.
- Primary ink `#152338`, secondary `#59677A`, border `#DCE5EC`, canvas `#F6F9FB`.
- Success green, warning amber, danger red, neutral blue. Always include textual status, never color only.
- Desktop layout: ~220px left navigation, main content max comfortably wide, modular cards, purposeful whitespace.
- Responsive: at narrow widths, sidebar collapses, annotations stack below case/answer, and tables scroll without truncating essential labels.
- Accessible: keyboard navigation, visible focus, labeled form controls, semantic headings, screen-reader announcements, AA contrast where feasible.

**Navigation/screens:**
1. Dashboard: real project counts, assigned queue, reviews due, approved records, recent activity.
2. Projects: create, edit, archive, configure taxonomy, rubric and reviewers.
3. Case Intake: create synthetic cases, bulk import validated CSV/JSONL, source/provenance, deduplication.
4. Prompt Builder: reusable clinical scenario templates, tags, version history.
5. Labeling Queue: filters, assignment, priority, status, progress, next task.
6. Labeling Workspace: case, prompt, answer, taxonomy, rationale, evidence spans, draft/submit.
7. Clinical Review: second-pass evaluation, feedback, corrections, approve/reject.
8. QA / Adjudication: compare independent labels, disagreement details, resolve final labels.
9. Taxonomy / Rubrics: categories, versioning, definitions, score anchors.
10. Exports: schema checks, data splits, versions, download history, reproducible manifests.
11. Reports: completion, reviewer agreement, issue frequencies, annotation distributions.
12. Team / Settings: roles, invitations (optional V1), audit log, project configuration.

**Seven-stage workflow indicator:** Project Setup → Case Intake → Prompt Design → Labeling Queue → Clinical Review → QA / Adjudication → Export Dataset. This is a navigation aid, not a fabricated single-status tracker. Some projects may skip adjudication when reviewers agree; business rules should be explicit.

---

## 4. Recommended architecture

Choose a straightforward, beginner-friendly, deployable stack:

- **Frontend/full stack:** Next.js App Router, React, TypeScript, Tailwind CSS.
- **UI:** shadcn/ui or accessible Radix primitives; Lucide icons; React Hook Form + Zod for complex forms.
- **Backend/database:** Supabase Postgres, Auth, and Row Level Security (RLS). Use migrations in version control. Use server routes/actions with authorization checks.
- **ORM/data access:** Prefer Supabase typed client or a single consistent query layer; do not introduce multiple competing data layers.
- **Testing:** Vitest + Testing Library for units/components, Playwright for critical flows; SQL/RLS integration tests where feasible.
- **Deploy:** Vercel + Supabase, with environment separation for local/dev/production.
- **Analytics:** Start with derived SQL queries. Add chart library only if it improves real reporting.
- **AI provider:** Not required for core V1. Abstract behind `ModelProvider`; support `ManualResponseProvider` and optional remote provider later. Never expose API keys in client code.

If the project already uses Vite + React and Supabase, **keep that stack** unless a concrete reason justifies migration. The behaviors and safeguards below matter more than brand-name frameworks.

Suggested directory organization:

```text
app/
  (auth)/
  (workspace)/dashboard/
  (workspace)/projects/
  (workspace)/cases/
  (workspace)/prompts/
  (workspace)/queue/
  (workspace)/label/
  (workspace)/review/
  (workspace)/adjudication/
  (workspace)/exports/
  (workspace)/reports/
components/
  layout/ clinical/ annotations/ workflows/ ui/
lib/
  auth/ db/ permissions/ validation/ taxonomy/ exports/ providers/
supabase/
  migrations/ seed.sql
tests/
  unit/ integration/ e2e/
docs/
  IMPLEMENTATION.md
  DATA_DICTIONARY.md
  ANNOTATION_GUIDE.md
  DEMO_SCRIPT.md
  THREAT_MODEL.md
```

---

## 5. Data model (Postgres; define migrations and RLS)

All IDs use UUIDs, all timestamps are timezone-aware, foreign keys and indexes are enforced, and every project-scoped object has a project ownership/tenant boundary. Prefer explicit status enums/check constraints with documented transitions.

**Core entities:**

- `profiles`: `user_id`, `display_name`, optional training/credential disclosure, timestamps. **Never imply that account users are credentialed without verification.**
- `projects`: `id`, `owner_id`, `name`, `clinical_domain`, `description`, `status`, `rubric_version_id`, `taxonomy_version_id`, timestamps.
- `project_members`: `project_id`, `user_id`, `role` (`owner`, `admin`, `annotator`, `reviewer`, `adjudicator`, `viewer`), timestamps. One user may have project-specific membership.
- `clinical_cases`: `id`, `project_id`, synthetic/de-identified `data_classification`, structured scenario JSON validated by Zod, `source_type`, source citation/notes, content hash, timestamps.
- `prompts`: `id`, `project_id`, `case_id`, `current_version_id`, timestamps.
- `prompt_versions`: immutable `id`, `prompt_id`, `version_number`, `prompt_text`, template metadata, `created_by`, `created_at`.
- `model_responses`: immutable `id`, `project_id`, `prompt_version_id`, `provider`, `model_name`, `model_version`, `generation_settings`, `response_text`, `origin` (`manual`, `provider`, `seed`), timestamps.
- `taxonomy_versions`: `id`, `project_id` or global template scope, `version`, `definitions_json`, `published_at`; published definitions must be immutable.
- `rubric_versions`: analogous immutable versioned criteria and score anchors.
- `tasks`: `id`, `project_id`, `response_id`, `task_type`, `status`, `priority`, `assignee_id`, `due_at`, timestamps. Keep assignment changes auditable.
- `annotations`: `id`, `task_id`, `annotator_id`, `taxonomy_version_id`, `rubric_version_id`, `status` (`draft`, `submitted`, `superseded`), structured `labels_json`, `rationale`, `confidence`, timestamps, revision number. Preserve submitted records; new corrections create revisions or a linked amendment.
- `annotation_evidence`: `id`, `annotation_id`, `response_start_offset`, `response_end_offset`, `quote_snapshot`, `issue_category`, notes. Validate offsets against immutable response.
- `clinical_reviews`: `id`, `task_id`, `annotation_id`, `reviewer_id`, `decision` (`approve`, `needs_changes`, `reject`), `comments`, `status`, timestamps.
- `adjudications`: `id`, `task_id`, `adjudicator_id`, `compared_annotation_ids`, `final_labels_json`, `reason`, `status`, timestamps. Never overwrite the underlying independent labels.
- `export_versions`: `id`, `project_id`, `semantic_version`, `schema_version`, `manifest_json`, `record_count`, `content_hash`, `created_by`, `created_at`, stored artifact path and expiration policy.
- `export_records`: `export_id`, `task_id`, `split` (`train`, `validation`, `test`), stable item hash; enforce uniqueness to avoid duplicating the same case across splits.
- `audit_events`: `id`, `project_id`, `actor_id`, `entity_type`, `entity_id`, `action`, `before_summary`, `after_summary`, `created_at` (write-only for normal users).

Use a separate reference table or JSON schema to store and version label definitions. Never rely on free-text tags alone.

**Important constraints:**
- Case/source data must clearly distinguish fully synthetic, explicitly authorized de-identified, and prohibited raw PHI. **V1 should accept synthetic data only by default.**
- Protect every read/write through RLS and server authorization, including exports and storage download URLs.
- Prevent an annotator from self-approving their own work in the required independent review flow.
- Independent annotations should not reveal one another until both are submitted if blind review is enabled.
- Only adjudicators may finalize disagreements. Archive prior versions rather than destructive overwrites.
- Every record in an export must reference immutable prompt, response, taxonomy and rubric versions.
- If importing data, validate MIME/size, schema, Unicode normalization, row limits, and duplicates. Show errors per row.

---

## 6. Annotation taxonomy and rubric

Implement a **configurable, versioned taxonomy** with definitions, examples, non-examples, and clear decision rules. Start with the following default categories:

**Clinical task type:** diagnosis / differential; triage / escalation; treatment planning; medication dosing; contraindications / interactions; interpretation of labs / imaging; patient education; follow-up / monitoring.

**Finding labels (multi-label):** clinically correct, omission, unsafe recommendation, missed contraindication, drug interaction, incorrect dose/route/frequency, ignored comorbidity, missed red flag, inappropriate escalation, insufficient escalation, unsupported claim/hallucinated guidance, ambiguity/insufficient information, nonresponsive.

**Severity:** none, low, moderate, high, critical. Define each with reproducible criteria; severity is about plausible patient impact, not writing quality.

**Verdict:** correct, partially correct, incorrect, cannot assess. Do not force a judgment if critical case details are missing.

**Rubric dimensions (1 to 5 with anchors):** accuracy, clinical safety, reasoning, completeness, communication. Provide `not applicable` where appropriate; do not silently average away missing dimensions. Show an overall score only if there is a documented aggregation formula.

**Required annotation fields:** verdict; safety severity; relevant issue labels; textual rationale; evidence quote/span for answer-specific claims; reviewer confidence (0 to 1); case-specific clinical reference and reference date if claiming a guideline-based correction; escalation recommendation if necessary.

**Quality principles:**
- Distinguish omission from direct false assertion and from unsafe recommendation.
- Recognize conditional recommendations: e.g., therapies that require electrolyte/renal monitoring are not automatically contraindicated in every patient with CKD.
- Require a source or clear reasoning for high-stakes clinical assertions; never auto-generate false citations.
- Preserve uncertainty, acknowledge incomplete facts, and make it possible to mark a question ambiguous.
- Annotators can flag the **question itself** as unsafe, underspecified, or medically misleading.
- Clinical correctness cannot be established from a model's own self-evaluation.

---

## 7. Lifecycle, permissions, and business rules

Suggested state flow:

```text
Project created
  -> case created/imported
  -> prompt version saved
  -> model response attached
  -> task queued/assigned
  -> annotation draft
  -> annotation submitted
  -> independent clinical review
      -> needs changes -> new annotation revision -> re-review
      -> approved -> QA gate
      -> disagreement -> adjudication -> finalized
  -> schema/export readiness checks
  -> immutable dataset export version
```

Define a centralized transition function or service, rather than allowing arbitrary `status` updates from any client. For each transition enforce identity, membership, expected prior state, and required fields. Use atomic transactions or equivalent safe server logic to avoid race conditions and duplicate submissions.

**Roles:** Owner/Admin manage projects; Annotator labels; Reviewer evaluates independently; Adjudicator resolves disagreement; Viewer reads permitted artifacts. In a single-person portfolio demo, the owner may switch among seeded **demo personas**, but the UI must clearly say they are simulated; never claim to have real independent medical reviewers.

**Review rules:** A `submitted` annotation is immutable; feedback creates a linked revision. Review must expose checklist/rubric, findings and clinician notes. Adjudication compares disagreeing submitted labels side by side, logs the rationale, and selects the final label set without deleting disagreement evidence.

**Export gate:** Exclude drafts, tasks with unresolved mandatory review, adjudication conflicts, failed schema validation, and duplicate/unauthorized records. Show counts of exclusions and reasons before generating.

---

## 8. Screens and key component behaviors

### A. Dashboard and projects
- Project creation wizard (name, domain, dataset purpose, taxonomy, rubric, review requirement).
- KPIs from real aggregate queries; if seeded, add a visible `Demo data` indicator.
- Project activity timeline from audit events; progress denominators must be consistent.

### B. Case Intake
- Structured synthetic case editor with explicit fields: chief complaint, HPI, age band, comorbidities, meds, allergies, vitals, key labs, relevant social factors, history, and source notes.
- Generate synthetic case templates locally from predefined examples. Avoid generating patient-like identifying details. No unrestricted EHR upload in V1.
- Bulk CSV/JSONL import with dry-run preview, validation and error reporting.
- Warn against entering real patient identifiers and reject obvious identifiers where feasible (not a guarantee of de-identification).

### C. Prompt Builder
- Prompt templates for differential, medication safety, triage, treatment, monitoring.
- Editor + case variables + rendered preview, required clinical context checklist.
- Explicit `Save new version`; cannot rewrite a prompt already used for an immutable response.
- Button to add manual model response for the MVP.

### D. Labeling Queue and Workspace
- Queue filters: project, domain, priority, assignee, state, issue type; next/previous tasks.
- Three-pane workspace: **Clinical Case & Prompt | Model Response | Annotation & Rubric**.
- Response text selection to attach exact quote spans as evidence.
- Severity, verdict, labels, rubric dimensions, confidence, rationale and reference/source fields.
- Autosave drafts safely; show save status and conflict handling.
- `Submit` performs field and state checks, stores audit event and advances queue.

### E. Clinical Review
- Reviewer sees submitted annotation plus original context; can approve, request changes or reject with reason.
- Display clinical references provided by annotator, clearly distinguish verified vs user-entered links.
- Do not automatically endorse any unsafe clinical recommendation in the demo.

### F. QA / Adjudication
- Side-by-side label comparison, highlighted disagreements, optional rubric deltas.
- Final verdict editor and mandatory reconciliation note.
- Show inter-rater agreement for comparable pairs; label metric definitions and sample size. Do not imply that a high agreement number alone proves medical accuracy.

### G. Export and Reports
- JSONL first; CSV for simple flattened use, with explicit indication of any nested data loss.
- Export manifest: schema version, taxonomy version, rubric version, creation timestamp, project ID, counts, split seed/algorithm, checksum.
- Deterministic splits by **case group**, not response row, to prevent related variants leaking across train/validation/test.
- Download controls, status, errors, and version history.
- Charts computed from actual status histories: items by state, safety labels, agreement, reviewer turnaround, and QA exclusions.

---

## 9. Suggested JSONL record schema

Each exported line must be valid JSON and validate against a published Zod/JSON Schema. Example shape (fictional and abbreviated):

```json
{
  "schema_version": "1.0.0",
  "project_id": "project-uuid",
  "case_id": "case-uuid",
  "case_classification": "synthetic",
  "case_group_id": "group-uuid",
  "clinical_domain": "cardiology",
  "prompt": {
    "version_id": "prompt-version-uuid",
    "text": "Synthetic clinical question..."
  },
  "model_response": {
    "id": "response-uuid",
    "model_name": "demo-manual-response",
    "origin": "seed",
    "text": "Illustrative model answer..."
  },
  "evaluation": {
    "taxonomy_version": "1.0.0",
    "rubric_version": "1.0.0",
    "verdict": "partially_correct",
    "safety_severity": "moderate",
    "labels": ["missed_red_flag"],
    "rubric_scores": {"accuracy": 3, "safety": 2, "reasoning": 3, "completeness": 2, "communication": 4},
    "rationale": "Educational demo example, not a clinical conclusion.",
    "evidence": [],
    "confidence": 0.8,
    "finalized_via": "adjudication"
  },
  "split": "validation"
}
```

In real exports, IDs must be actual UUIDs and records must include the required immutable foreign references and provenance metadata. Do not include raw personally identifying information, auth secrets, or private reviewer details in a public demo dataset.

---

## 10. Clinical safety, privacy, and ethics (non-negotiable)

1. **Synthetic-only public demo.** Do not import identifiable patient records, scrape patient charts, or imply HIPAA compliance from using a particular vendor. The application is **not HIPAA-certified** merely because it uses Supabase/Vercel.
2. **Clear disclaimers:** Display in relevant UI and README: “For AI evaluation research and education. Not for diagnosis, treatment, or direct patient care.”
3. **No unverifiable credentials.** Display demo reviewers as `Demo Reviewer A`, `Demo Reviewer B`, not fabricated physicians/RNs; only display verified credentials when actually verified.
4. **No fabricated guideline evidence.** If providing seeded guideline references, link to real publicly available primary clinical sources and list publication dates. Mark examples as educational and potentially outdated. Never invent journal citations or claim a sourced guideline was verified unless actually checked.
5. **Do not optimize for giving medical treatment advice.** The app is for *evaluating* model outputs and documenting safety findings. AI-generated answers are untrusted examples and never automatically published as clinical recommendations.
6. **Protected access:** Auth, project-level RLS, least privilege, secure sessions, input/output sanitization, server-side rate limits on expensive routes, signed storage links, and audit logs.
7. **Secrets:** `.env.local` only, gitignored; `.env.example` includes placeholder names only. Never expose service-role credentials or provider keys to the browser.
8. **Threat model:** Guard against prompt injection inside user cases/model outputs, insecure direct-object references, cross-tenant data exposure, export leaks, unsafe uploads, CSV injection, and excessive resource consumption.
9. **Data governance:** Offer deletion/export for owned project data and retention settings. Avoid claiming production healthcare compliance without an actual legal/security assessment.
10. **Role boundaries:** Student-created labels represent student interpretation or synthetic demo judgments, not validated clinical ground truth unless qualified experts truly review them.

---

## 11. Testing and validation

**Minimum automated tests:**
- Taxonomy/rubric schema validation and severity/verdict required fields.
- Prompt version immutability after model response creation.
- Cannot submit incomplete annotation; can save valid partial drafts.
- Annotator cannot approve their own annotation in independent-review mode.
- Incorrect role cannot adjudicate or access another project's data.
- Reviewer disagreement preserved through adjudication.
- Export excludes unresolved/invalid tasks and uses deterministic nonleaking case-group splits.
- JSONL lines parse independently and conform to the schema.
- CSV export prevents formula injection by escaping dangerous cell-leading characters.
- Derived KPI calculations match seeded records.

**Playwright critical path:**
1. Open project → create synthetic case → create prompt → attach model answer.
2. Assign/label → autosave → refresh and resume → submit.
3. Reviewer requests changes → annotator revises → reviewer approves.
4. Two demo annotators disagree → adjudicator resolves.
5. Export → download JSONL → validate file and counts.

**Manual checks:** desktop and mobile, keyboard-only entry, loading/empty/error states, permission-denied states, long clinical text, duplicate submission, optimistic concurrency, route refresh, and back navigation.

Quality gates for every milestone:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Add these scripts to `package.json` as appropriate. Report genuine failures; don't hide them.

---

## 12. Build milestones (do in order)

### Milestone 0: Bootstrap and documentation
- Inspect repo. Set up app, TypeScript, linting, tests, environment template, `.gitignore`, README, and UI primitives.
- Create `docs/IMPLEMENTATION.md` with checklist and architectural decisions.
- Create `docs/THREAT_MODEL.md` and an initial synthetic-only data policy.
- Ensure local boot works with an explicit command.

### Milestone 1: Design system + navigation
- Build sidebar, responsive layout, workflow stepper, status chips, forms, toast/error boundaries, skeleton/empty states.
- Implement Dashboard/Projects screen using clearly labeled mock data **temporarily**; remove any simulated operational KPIs before launch.
- Match supplied mockups without sacrificing functional accessibility.

### Milestone 2: Auth + database + roles
- Supabase auth, schema migrations, seed data, RLS policies, project membership enforcement, audit trail.
- At least two simulated demo identities or role-switching in local development with transparent labeling; never treat front-end role switch as an auth bypass in production.

### Milestone 3: Project → case → prompt → response
- CRUD project and fully synthetic case intake.
- Prompt editing/versioning; manual model-response entry and immutable storage.
- At the end, a fresh project can generate a queued labeling task without SQL console intervention.

### Milestone 4: Labeling vertical slice
- Working queue, task assignment, three-pane labeling UI, taxonomy, rubric, rationale, evidence spans, autosave, submit, validation.
- Add tests of every critical transition.

### Milestone 5: Clinical review + QA
- Independent review workflow, revision history, disagreement creation, side-by-side adjudication, audit evidence, permissions.

### Milestone 6: Versioned exports + reporting
- Eligibility checks, deterministic split, JSONL/CSV generators, download, manifest/checksum, computed metrics and charts.

### Milestone 7: Portfolio readiness
- Polish responsive UX, a guided **Demo Project**, clean README with screenshots and architecture diagram, `docs/DEMO_SCRIPT.md`, accessibility pass, seeded public-safe dataset, test coverage summary, and deploy preview.
- Add a concise, truthful resume bullet and portfolio case study only for features that were completed and demonstrated.

**Avoid scope creep until this V1 is complete:** real EHR integrations, PHI handling, enterprise SSO, clinical production compliance claims, elaborate ML training pipelines, real-time multi-user collaboration, expensive model orchestration, auto-generated citations, and automatic diagnosis/treatment suggestions.

---

## 13. Seed demo project (must be safe and honest)

Provide a small curated set of fictional educational examples covering:
- Cardiology with comorbidities and medication safety.
- Diabetes and acute red-flag recognition.
- Medication reconciliation / interactions.
- Renal function and dose-adjustment considerations.
- Symptom triage and escalation.

Use synthetic records, explicitly labeled `Demo Data`. Include intentionally imperfect *fictional model answers* to demonstrate the annotation UI, without representing them as medically endorsed advice. For nuanced cases, do not hard-code absolute statements such as “all CKD stage 3 patients must avoid [drug]”; ensure flags represent conditional clinical evaluation and the limits of the vignette. Keep examples limited and explain that expert review is required before educational labels should be treated as gold-standard.

Make a sample scenario in which two demo labelers disagree on `correct` vs `partially_correct`, with separate rationale and a final adjudication event. Seed this through migrations or an idempotent seed command.

---

## 14. Developer experience and documentation

The README must include:

- What the app does and who it is for, with non-clinical-use disclaimer.
- Prerequisites: Node LTS, package manager, Supabase account/project, optional Vercel.
- Setup from a clean machine, including `.env.example`, database migrations, seed, and local dev command.
- How to use the complete demo workflow and reset demo data.
- Role/permission matrix and data-lifecycle diagram.
- Testing and deployment instructions.
- Screenshots or screen recordings of actual implemented features.
- Architecture decisions/tradeoffs, current limitations, and future improvements.
- Precise attribution: “independent portfolio project”; do not call it paid clinical employment or imply partnership with a medical organization.

Include `docs/ANNOTATION_GUIDE.md` with label definitions, severity criteria, borderline examples, and escalation policy. Include `docs/DATA_DICTIONARY.md` with all fields and sample payloads.

Use clear commit messages focused on working increments; recommend a branch per milestone or coherent feature. Never commit passwords or private clinical documents.

---

## 15. Portfolio standard

The project is valuable because it demonstrates the **intersection of healthcare knowledge and technical execution**. Its strongest proof points are:

- A functional annotation tool with clinical issue taxonomy and evidence-backed rationales.
- Correct workflow and permissions for blind/independent review and adjudication.
- Exportable, versioned, validated AI evaluation datasets.
- Engineering discipline: migrations, tests, auth/RLS, auditing, clear documentation, deployed demo.
- Thoughtful constraints, especially patient privacy and uncertainty.

**Resume bullet template (only after implemented):**

> Built ClinReview, an independent full-stack medical AI evaluation platform using React/TypeScript and PostgreSQL, supporting synthetic clinical case creation, structured safety annotations, independent review, adjudication, and versioned JSONL dataset exports; implemented role-based access and automated workflow tests.

Customize with actual stack and measurable outcomes. Do not invent user adoption, expert validation, medical employment, or performance numbers.

---

## 16. Claude Code start instructions

**On your first run:**

1. Read this entire `CLAUDE.md`.
2. Inspect the existing repository and report what exists, what is missing, and any contradictions with this specification.
3. Create/refresh `docs/IMPLEMENTATION.md` as a milestone checklist.
4. State the proposed stack and directory plan in 5–10 bullets. Default to the recommended stack if starting from scratch.
5. **Start implementing Milestone 0 and the first working vertical slice now.** Do not stop at a design proposal or ask for unnecessary approval.
6. After coding, run the relevant checks, report the exact outcome and next highest-priority task.

**Operating instruction for future sessions:** Always begin by reading `CLAUDE.md` and `docs/IMPLEMENTATION.md`, inspect `git status`, preserve uncommitted changes, and resume the earliest incomplete milestone. Favor verifiable working functionality over a pixel-perfect but inert mockup.
