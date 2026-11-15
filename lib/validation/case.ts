import { z } from "zod";

export const AGE_BANDS = ["18-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90+"] as const;

/** Multi-line textarea -> trimmed string list. */
const lines = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split("\n")).map((s) => s.normalize("NFC").trim()).filter(Boolean))
  .pipe(z.array(z.string().max(300)).max(40));

const text = (max: number) => z.string().transform((s) => s.normalize("NFC").trim()).pipe(z.string().max(max));

export const ScenarioSchema = z.object({
  age_band: z.enum(AGE_BANDS),
  sex: z.enum(["female", "male", "unspecified"]),
  chief_complaint: text(300).pipe(z.string().min(3, "Chief complaint is required.")),
  hpi: text(4000).pipe(z.string().min(10, "History of present illness is required (10+ characters).")),
  past_history: text(2000).default(""),
  comorbidities: lines.default([]),
  medications: lines.default([]),
  allergies: lines.default([]),
  vitals: z.object({
    bp: text(20).default(""),
    hr: text(20).default(""),
    rr: text(20).default(""),
    spo2: text(30).default(""),
    temp_c: text(20).default(""),
  }),
  labs: lines.default([]),
  social_factors: text(1000).default(""),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const CaseInputSchema = z.object({
  project_id: z.string().uuid(),
  title: text(160).pipe(z.string().min(3, "Title is required.")),
  scenario: ScenarioSchema,
  source_type: z.enum(["authored_synthetic", "template_synthetic", "imported_synthetic"]),
  source_notes: text(2000).pipe(z.string().min(10, "Describe where this synthetic scenario came from (10+ characters).")),
  synthetic_attestation: z.literal(true, { errorMap: () => ({ message: "Confirm that this case is fully synthetic." }) }),
  case_group_id: z.string().uuid().optional(),
});
export type CaseInput = z.infer<typeof CaseInputSchema>;

/**
 * Heuristic screen for obvious direct identifiers. This is NOT de-identification; it only
 * catches common accidental pastes. The UI states this limitation.
 */
const IDENTIFIER_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "email address", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { label: "phone number", re: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/ },
  { label: "SSN-like number", re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { label: "medical record number", re: /\b(MRN|medical record (number|no\.?)|patient id)\s*[:#]?\s*[A-Z0-9-]{4,}/i },
  { label: "full date (possible date of birth or visit)", re: /\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](19|20)\d{2}\b|\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/ },
  { label: "date of birth label", re: /\b(DOB|date of birth)\b/i },
  { label: "street address", re: /\b\d{1,5}\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/ },
  { label: "patient name label", re: /\b(patient name|pt name|name)\s*:\s*[A-Z][a-z]+/i },
  { label: "exact age over 89", re: /\b(9\d|1[0-1]\d)[- ]?(year|yr)s?[- ]?old\b/i },
];

export function detectLikelyIdentifiers(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      for (const p of IDENTIFIER_PATTERNS) if (p.re.test(v)) found.add(p.label);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return [...found];
}

