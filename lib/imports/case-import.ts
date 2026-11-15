import { z } from "zod";
import { CaseInputSchema, detectLikelyIdentifiers, type CaseInput } from "@/lib/validation/case";
import { parseCsv } from "./csv-parse";

export const IMPORT_LIMITS = { maxBytes: 1_000_000, maxRows: 200 } as const;
export const CSV_COLUMNS = [
  "title", "age_band", "sex", "chief_complaint", "hpi", "past_history", "comorbidities", "medications", "allergies",
  "labs", "bp", "hr", "rr", "spo2", "temp_c", "social_factors", "source_notes", "case_group_key",
] as const;
const REQUIRED_COLUMNS = ["title", "age_band", "sex", "chief_complaint", "hpi", "source_notes"];
const ALLOWED_MIME = ["text/csv", "application/vnd.ms-excel", "text/plain", "application/x-ndjson", "application/jsonl", "application/json", ""];

export type ImportFormat = "csv" | "jsonl";
export interface ImportFile { fileName: string; mimeType: string; content: string }

export interface ParsedRow {
  row: number; // 1-based data row (CSV header excluded)
  title: string;
  caseGroupKey: string | null;
  input: Omit<CaseInput, "project_id" | "synthetic_attestation" | "source_type"> | null;
  errors: string[];
}

/** File-level checks: extension, MIME type, size, encoding. Throws a user-facing message. */
export function checkFile(f: ImportFile): ImportFormat {
  const ext = f.fileName.toLowerCase().split(".").pop();
  const format: ImportFormat | null = ext === "csv" ? "csv" : ext === "jsonl" || ext === "ndjson" ? "jsonl" : null;
  if (!format) throw new Error("Upload a .csv or .jsonl file.");
  if (!ALLOWED_MIME.includes(f.mimeType)) throw new Error(`Unsupported file type "${f.mimeType}".`);
  if (Buffer.byteLength(f.content, "utf8") > IMPORT_LIMITS.maxBytes) throw new Error(`File is larger than ${IMPORT_LIMITS.maxBytes / 1_000_000} MB.`);
  if (/\u0000/.test(f.content) || f.content.includes("�")) throw new Error("File does not look like UTF-8 text.");
  return format;
}

const listField = (v: unknown) => (typeof v === "string" ? v.split(/[;\n]/) : v);

/** Turn one raw record (CSV row object or JSONL object) into case input + error list. */
function toRow(row: number, raw: Record<string, unknown>): ParsedRow {
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : raw[k] === undefined || raw[k] === null ? "" : String(raw[k]));
  const scenarioRaw = (typeof raw.scenario === "object" && raw.scenario) ? raw.scenario as Record<string, unknown> : null;
  const scenario = scenarioRaw
    ? { ...scenarioRaw, comorbidities: listField(scenarioRaw.comorbidities ?? []), medications: listField(scenarioRaw.medications ?? []), allergies: listField(scenarioRaw.allergies ?? []), labs: listField(scenarioRaw.labs ?? []), vitals: scenarioRaw.vitals ?? {} }
    : {
        age_band: s("age_band"), sex: s("sex") || "unspecified", chief_complaint: s("chief_complaint"), hpi: s("hpi"), past_history: s("past_history"),
        comorbidities: listField(s("comorbidities")), medications: listField(s("medications")), allergies: listField(s("allergies")), labs: listField(s("labs")),
        vitals: { bp: s("bp"), hr: s("hr"), rr: s("rr"), spo2: s("spo2"), temp_c: s("temp_c") }, social_factors: s("social_factors"),
      };
  const candidate = { project_id: "00000000-0000-4000-8000-000000000000", title: s("title"), scenario, source_type: "imported_synthetic", source_notes: s("source_notes"), synthetic_attestation: true };
  const parsed = CaseInputSchema.safeParse(candidate);
  const errors = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.filter((p) => p !== "scenario").join(".") || "row"}: ${i.message}`);
  const ids = detectLikelyIdentifiers({ title: s("title"), scenario, notes: s("source_notes") });
  if (ids.length) errors.push(`Possible real identifiers: ${ids.join(", ")}. Only synthetic data is accepted.`);
  return {
    row, title: s("title") || `(row ${row})`, caseGroupKey: s("case_group_key").trim() || null, errors,
    input: parsed.success ? { title: parsed.data.title, scenario: parsed.data.scenario, source_notes: parsed.data.source_notes } : null,
  };
}

/** Parse + validate every row. Never throws for row-level problems; they are reported per row. */
export function parseImport(f: ImportFile): ParsedRow[] {
  const format = checkFile(f);
  const text = f.content.replace(/^﻿/, "").normalize("NFC");
  let records: Record<string, unknown>[] = [];
  const preErrors = new Map<number, string>();
  if (format === "csv") {
    const [header, ...data] = parseCsv(text);
    if (!header) throw new Error("The file is empty.");
    const cols = header.map((h) => h.trim().toLowerCase());
    const missing = REQUIRED_COLUMNS.filter((c) => !cols.includes(c));
    if (missing.length) throw new Error(`Missing required column(s): ${missing.join(", ")}. Download the template for the expected header.`);
    const unknown = cols.filter((c) => !(CSV_COLUMNS as readonly string[]).includes(c));
    if (unknown.length) throw new Error(`Unknown column(s): ${unknown.join(", ")}.`);
    records = data.map((r, i) => {
      if (r.length !== cols.length) preErrors.set(i + 1, `Expected ${cols.length} columns, found ${r.length}.`);
      return Object.fromEntries(cols.map((c, j) => [c, r[j] ?? ""]));
    });
  } else {
    records = text.split(/\r?\n/).filter((l) => l.trim()).map((line, i) => {
      try {
        const v = JSON.parse(line);
        if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
        return v as Record<string, unknown>;
      } catch {
        preErrors.set(i + 1, "Line is not a valid JSON object.");
        return {};
      }
    });
  }
  if (!records.length) throw new Error("The file has no data rows.");
  if (records.length > IMPORT_LIMITS.maxRows) throw new Error(`Too many rows (${records.length}); the limit is ${IMPORT_LIMITS.maxRows} per import.`);
  return records.map((r, i) => {
    const parsed = toRow(i + 1, r);
    const pre = preErrors.get(i + 1);
    return pre ? { ...parsed, input: null, errors: [pre, ...parsed.errors] } : parsed;
  });
}

export const ImportRequestSchema = z.object({
  project_id: z.string().uuid(),
  file_name: z.string().min(1).max(200),
  mime_type: z.string().max(100),
  content: z.string(),
});
