import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { IMPORT_LIMITS, parseImport } from "@/lib/imports/case-import";
import { parseCsv } from "@/lib/imports/csv-parse";
import { checkRateLimit, resetRateLimits } from "@/lib/server/rate-limit";

const HEADER = "title,age_band,sex,chief_complaint,hpi,source_notes,comorbidities";
const row = (title: string, extra = "") => `"${title}",50-59,male,"Cough for a week","Dry cough for one week, no fever.","Fictional test row.","${extra}"`;
const csv = (...rows: string[]) => ({ fileName: "cases.csv", mimeType: "text/csv", content: [HEADER, ...rows].join("\n") });

describe("parseCsv", () => {
  it("handles quotes, embedded commas, escaped quotes, newlines and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi""\nthen left"\r\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"\nthen left']]);
  });
  it("skips blank lines and rejects unterminated quotes", () => {
    expect(parseCsv("a\n\n b \n")).toEqual([["a"], [" b "]]);
    expect(() => parseCsv('a\n"oops')).toThrow(/Unterminated/);
  });
});

describe("parseImport", () => {
  it("parses valid CSV rows and splits list fields on ';'", () => {
    const [r] = parseImport(csv(row("Cough case", "Asthma;GERD")));
    expect(r!.errors).toEqual([]);
    expect(r!.input!.scenario.comorbidities).toEqual(["Asthma", "GERD"]);
  });
  it("reports per-row errors without failing the whole file", () => {
    const rows = parseImport(csv(row("Good row"), `"",50-59,male,"","x","Fictional test row.",""`, row("Has MRN: 99887766")));
    expect(rows.map((r) => r.errors.length > 0)).toEqual([false, true, true]);
    expect(rows[2]!.errors.join()).toMatch(/identifiers/);
  });
  it("rejects missing or unknown columns, wrong extension, MIME type, size and row count", () => {
    expect(() => parseImport({ ...csv(row("x")), content: "title,hpi\nx,y" })).toThrow(/Missing required column/);
    expect(() => parseImport({ ...csv(row("x")), content: `${HEADER},ssn\n${row("x")},1` })).toThrow(/Unknown column/);
    expect(() => parseImport({ ...csv(row("x")), fileName: "cases.xlsx" })).toThrow(/\.csv or \.jsonl/);
    expect(() => parseImport({ ...csv(row("x")), mimeType: "application/pdf" })).toThrow(/Unsupported file type/);
    expect(() => parseImport({ ...csv(row("x")), content: "x".repeat(IMPORT_LIMITS.maxBytes + 1) })).toThrow(/larger than/);
    expect(() => parseImport(csv(...Array.from({ length: IMPORT_LIMITS.maxRows + 1 }, (_, i) => row(`Row ${i}`))))).toThrow(/Too many rows/);
  });
  it("reports rows with the wrong number of columns", () => {
    const [r] = parseImport(csv(`"Short row",50-59`));
    expect(r!.errors[0]).toMatch(/Expected 7 columns/);
  });
  it("parses JSONL and flags invalid lines", () => {
    const rows = parseImport({ fileName: "c.jsonl", mimeType: "", content: `${JSON.stringify({ title: "J case", scenario: { age_band: "30-39", sex: "female", chief_complaint: "Rash", hpi: "Itchy rash for two days.", vitals: {} }, source_notes: "Fictional test row." })}\nnot json\n` });
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[1]!.errors[0]).toMatch(/not a valid JSON object/);
  });
  it("accepts the shipped templates without errors", () => {
    for (const f of ["case-import-template.csv", "case-import-template.jsonl"]) {
      const content = readFileSync(`public/templates/${f}`, "utf8");
      const rows = parseImport({ fileName: f, mimeType: "", content });
      expect(rows.flatMap((r) => r.errors), f).toEqual([]);
    }
  });
});

describe("rate limiting", () => {
  beforeEach(() => resetRateLimits());
  it("allows up to the limit within the window, then blocks, then recovers", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("u1", "export", 1000);
    expect(() => checkRateLimit("u1", "export", 1000)).toThrow(/Too many export requests/);
    expect(() => checkRateLimit("u2", "export", 1000)).not.toThrow(); // per user
    expect(() => checkRateLimit("u1", "export", 1000 + 61_000)).not.toThrow(); // window passed
  });
});
