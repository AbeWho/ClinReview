# Demo script (about 10 minutes)

Start fresh: `npm run db:reset` (with the server stopped), then `npm run dev` and open http://localhost:3000. Use **Switch persona** in the top bar to change roles. Every persona is simulated.

1. **Demo Project Lead → Dashboard.** Point out the disclaimer bar, the "Demo data" badge, and that the KPI tiles are live counts.
2. **Projects → the demo project.** Show the configuration (pinned taxonomy/rubric versions, blind mode, synthetic-only policy), the members list, and the activity trail.
3. **Add synthetic case.** Choose an example template or type a case. Try putting `MRN: 12345678` in the HPI and show the rejection. Confirm the attestation and save.
4. **Prompt Builder (on the case page).** Insert the *Triage* template, note the context checklist, and *Save version 1*. Edit and save version 2 to show the version history.
5. **Attach a model response** (any fictional text). Note that the provenance fields record that it was imported, not generated. **Queue** it and assign Demo Annotator A.
6. **Demo Annotator A → Labeling Queue → your task → Start labeling.** Select a sentence in the response and click *Add as evidence*. Pick a verdict, then **refresh the browser**: the draft is still there. Click *Submit* early to show the validation errors, complete the remaining fields, and submit.
7. **Demo Reviewer → Clinical Review.** Open the annotation, tick checklist items, *Request changes* with a comment.
8. **Demo Annotator A** → the task shows the feedback → *Start revision 2* → edit → submit. **Demo Reviewer** → *Approve*. The task is now *Finalized*.
9. **Demo Annotator B** → open the HFrEF task: Annotator A's labels are not visible (blind mode, enforced by the database).
10. **Demo Adjudicator → QA / Adjudication → Warfarin case.** Show the highlighted differences and rubric deltas, write the reconciliation note, and finalize. Both original annotations remain unchanged.
11. **Demo Project Lead → Exports.** Read the exclusion reasons, generate v1.0.0, and download the JSONL, CSV and manifest. Generating again with the same seed reproduces the same checksum (v1.1.0).
12. **Reports.** Every number is computed from records, κ is shown with its sample size, and agreement is not equated with accuracy.
13. **Team & Audit.** The permission matrix and the append-only audit log.
