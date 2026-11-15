# Data dictionary

Source of truth: `supabase/migrations/0001_schema.sql` (tables, constraints, triggers) and `0002_rls.sql` (policies). All IDs are UUIDs and all timestamps are `timestamptz`. Rows that belong to a project carry `project_id`, with composite FKs keeping children inside their project.

| Table | Purpose | Key fields / rules |
|---|---|---|
| `profiles` | People (demo personas in V1) | `display_name`, `is_demo_persona`, `training_disclosure` (free text, never shown as a credential), `credential_verified` (false) |
| `taxonomy_versions` / `rubric_versions` | Versioned label definitions | `version` semver, `definitions_json` (Zod-validated), `published_at`; **immutable once published** |
| `projects` | Evaluation project | `clinical_domain`, `dataset_purpose`, pinned `taxonomy_version_id` / `rubric_version_id`, `default_required_annotations` 1–2, `blind_annotation`, `allow_deidentified` (always false), `status` active/archived, `is_demo` |
| `project_members` | Per-project roles | PK `(project_id, user_id, role)`; role ∈ owner, admin, annotator, reviewer, adjudicator, viewer |
| `clinical_cases` | Synthetic scenario | `scenario_json` (see below), `data_classification` = synthetic, `source_type`, `source_notes`, `content_hash` (unique per project), `case_group_id` (split unit) |
| `prompts` | Prompt per case | `current_version_id`, `tags` |
| `prompt_versions` | **Immutable** prompt text | `version_number` (unique per prompt), `prompt_text`, `template_key` |
| `model_responses` | **Immutable** answer | `prompt_version_id`, `provider`, `model_name`, `model_version`, `generation_settings`, `origin` manual/provider/seed, `generated_at`, `created_at` (recorded) |
| `tasks` | One evaluation item per response | `status` queued → in_progress → in_review / changes_requested → adjudication → finalized (derived); `priority`, `required_annotations`, `finalized_via` review/consensus/adjudication, `final_annotation_id` |
| `task_assignments` | Annotator assignments | PK `(task_id, annotator_id)`; at most `required_annotations` |
| `annotations` | Labels by one annotator | `revision`, `revises_annotation_id`, `status` draft/submitted/superseded, `labels_json`, `rationale`, `confidence` 0–1, `lock_version`; submitted rows immutable; one draft and one submission per annotator per task |
| `annotation_evidence` | Quoted spans | `response_start_offset`, `response_end_offset`, `quote_snapshot` (DB-checked against the response text), `issue_category`, `notes`; editable only while the draft is open |
| `clinical_reviews` | Review decision | one per annotation revision; `decision` approve/needs_changes/reject, `comments`, `checklist_json`; reviewer ≠ annotator (trigger) |
| `adjudications` | Final labels for a disagreement | `compared_annotation_ids` (≥2), `final_labels_json`, `final_rationale`, `reason` (≥20 chars); adjudicator ≠ annotators |
| `export_versions` | Immutable dataset release | `semantic_version` (unique per project), `schema_version`, `split_seed`, `manifest_json`, `content_hash` (sha256 of JSONL), `jsonl_content`, `csv_content` |
| `export_group_splits` / `export_records` | Split bookkeeping | one split per case group per export (enforced by composite FK) |
| `audit_events` | Append-only log | `actor_id`, `entity_type`, `entity_id`, `action`, `before_summary`, `after_summary` |

## `scenario_json`
```json
{ "age_band": "60-69", "sex": "female", "chief_complaint": "…", "hpi": "…", "past_history": "…",
  "comorbidities": ["…"], "medications": ["…"], "allergies": ["…"],
  "vitals": { "bp": "148/86", "hr": "96", "rr": "20", "spo2": "94% room air", "temp_c": "37.1" },
  "labs": ["…"], "social_factors": "…" }
```

## `labels_json`
```json
{ "task_type": "treatment_planning", "verdict": "partially_correct", "safety_severity": "moderate",
  "findings": ["omission", "drug_interaction"],
  "rubric_scores": { "accuracy": 4, "safety": 2, "reasoning": 3, "completeness": 3, "communication": "na" },
  "question_flags": [], "escalation_recommendation": "",
  "reference": { "citation": "", "url": "", "reference_date": "" } }
```

## Export record (JSONL line, schema 1.0.0)
Defined and validated by `ExportRecordSchema` in `lib/exports/schema.ts`. Abbreviated:
```json
{ "schema_version": "1.0.0", "record_id": "<task uuid>", "project_id": "…", "case_id": "…", "case_group_id": "…",
  "case_classification": "synthetic", "clinical_domain": "…", "case_scenario": { },
  "prompt": { "prompt_id": "…", "version_id": "…", "version_number": 1, "text": "…" },
  "model_response": { "id": "…", "model_name": "…", "model_version": "…", "origin": "seed", "generated_at": null, "recorded_at": "…", "text": "…" },
  "evaluation": { "taxonomy_version": "1.0.0", "rubric_version": "1.0.0", "verdict": "…", "safety_severity": "…", "labels": ["…"],
    "rubric_scores": { }, "rationale": "…", "evidence": [{ "annotation_id": "…", "start": 0, "end": 10, "quote": "…" }],
    "confidence": 0.8, "finalized_via": "adjudication", "finalized_at": "…" },
  "provenance": { "source_annotations": [{ "annotation_id": "…", "annotator_ref": "annotator-3f9a…", "revision": 1, "verdict": "…" }],
    "adjudication_id": "…", "audit_event_ids": ["…"], "label_provenance_note": "…" },
  "split": "train" }
```
The manifest records the schema/taxonomy/rubric versions, counts, exclusions by reason, split seed and algorithm, a sha256 checksum, and what the CSV loses compared with the JSONL.

## Case import files
- **CSV** header (required columns marked *): `title*, age_band*, sex*, chief_complaint*, hpi*, past_history, comorbidities, medications, allergies, labs, bp, hr, rr, spo2, temp_c, social_factors, source_notes*, case_group_key`. List fields use `;` as a separator.
- **JSONL**: one object per line, `{ "title", "scenario": { …same shape as scenario_json… }, "source_notes", "case_group_key"? }`.
- Rows sharing a `case_group_key` share one `case_group_id`, so they always land in the same dataset split. Imported cases get `source_type = imported_synthetic`.
- Templates: `public/templates/case-import-template.csv` and `.jsonl`.
