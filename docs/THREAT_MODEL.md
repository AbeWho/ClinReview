# Threat model and data policy

## Data policy (V1)
- **Synthetic data only.** `projects.allow_deidentified` is constrained to `false`; cases are stored as `synthetic` and require an attestation checkbox.
- An identifier screen rejects obvious emails, phone numbers, SSN-like numbers, MRN labels, full dates, DOB labels, street addresses, name labels and exact ages over 89. **This is a heuristic, not de-identification.**
- ClinReview is **not HIPAA-certified**. Using Supabase or Vercel does not make it compliant.
- Demo personas are labeled *Simulated*; no clinical credentials are shown unless verified (no verification process exists in V1).

## Threats and mitigations

| Threat | Mitigation | Verified by |
|---|---|---|
| Guessing IDs (IDOR) | RLS filters every table by membership; invisible rows return "not found" | Integration tests |
| Cross-tenant references | Composite FKs `(id, project_id)` | Schema |
| Client-set status | Status derived server-side inside the transaction | Unit + integration |
| Self-approval | Service check **and** DB trigger | Integration |
| Tampering with history | Immutability triggers; no UPDATE/DELETE grants on audit, reviews, adjudications, exports | Integration |
| Session forgery | HMAC-SHA256 cookie, timing-safe compare, 12h expiry, httpOnly, SameSite=Lax, Secure in prod | Code review |
| Demo auth left on in prod | Off unless `DEMO_AUTH_ENABLED=true`; only demo personas usable | Code |
| Missing secret | Production refuses to sign sessions without a 32+ char `SESSION_SECRET` | Code |
| Export leaks | Download requires a session (401) plus RLS; annotators exported as salted hashes, no emails | E2E + integration |
| CSV formula injection | Leading `= + - @ \t \r` prefixed with `'`; all cells quoted | Unit |
| XSS | React escapes all text; no HTML rendering; reference links must be https and use `noopener noreferrer nofollow` | Code |
| Prompt injection | No LLM processes content in V1; UI labels case/response text as untrusted | n/a |
| Lost/overwritten work | `lock_version` optimistic concurrency, serialized autosave, conflict banner, unload warning | Integration + E2E |
| Unsafe uploads | Import accepts only .csv/.jsonl, allow-listed MIME types, ≤1 MB, ≤200 rows, UTF-8 (BOM stripped, NFC), per-row schema + identifier checks; content is parsed as data and never executed | Unit + integration + E2E |
| Excessive resource use | Per-user rate limits on export generation (5/min) and import (20/min); input length caps | Unit |
| Clickjacking/sniffing | `X-Frame-Options: DENY`, `nosniff`, strict referrer policy | Config |

## Known gaps
Rate limits are in-memory per process (need a shared store for multi-instance hosting); no real authentication yet; no retention/deletion jobs, no formal security review.
