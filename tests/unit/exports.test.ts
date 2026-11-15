import { describe, expect, it } from "vitest";
import { escapeCsvCell, toCsv } from "@/lib/exports/csv";
import { assignSplit } from "@/lib/exports/split";
import { agreementStats, median } from "@/lib/reports/agreement";

describe("CSV formula-injection protection", () => {
  it.each(["=HYPERLINK(\"x\")", "+1+1", "-2", "@SUM(A1)", "\tcmd", "\rcmd"])("neutralizes %j", (v) => {
    expect(escapeCsvCell(v).startsWith(`"'`)).toBe(true);
  });
  it("quotes and escapes double quotes", () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });
  it("writes headers and rows", () => {
    expect(toCsv(["a", "b"], [{ a: 1, b: "x" }])).toBe('"a","b"\r\n"1","x"\r\n');
  });
});

describe("deterministic case-group splits", () => {
  it("returns the same split for the same group and seed", () => {
    expect(assignSplit("11111111-1111-1111-1111-111111111111", "s1")).toBe(assignSplit("11111111-1111-1111-1111-111111111111", "s1"));
  });
  it("roughly follows 70/15/15 over many groups", () => {
    const counts = { train: 0, validation: 0, test: 0 };
    for (let i = 0; i < 4000; i++) counts[assignSplit(`group-${i}`, "seed")]++;
    expect(counts.train / 4000).toBeGreaterThan(0.66);
    expect(counts.train / 4000).toBeLessThan(0.74);
    expect(counts.validation).toBeGreaterThan(450);
    expect(counts.test).toBeGreaterThan(450);
  });
});

describe("agreement metrics", () => {
  it("computes percent agreement and kappa", () => {
    const s = agreementStats([["a", "a"], ["b", "b"], ["a", "b"], ["b", "a"]]);
    expect(s.n).toBe(4);
    expect(s.percentAgreement).toBe(0.5);
    expect(s.cohensKappa).toBeCloseTo(0);
  });
  it("returns null kappa when chance agreement is 1", () => {
    expect(agreementStats([["a", "a"], ["a", "a"]]).cohensKappa).toBeNull();
  });
  it("handles empty input", () => {
    expect(agreementStats([])).toEqual({ n: 0, percentAgreement: null, cohensKappa: null });
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
  });
});
