/**
 * Inter-rater agreement on a categorical label for pairs of raters.
 * - percentAgreement: share of pairs with identical labels.
 * - cohensKappa: agreement corrected for chance, (po - pe) / (1 - pe). Undefined (null) when
 *   pe = 1 (both raters always used one identical category) or when there are no pairs.
 * Small samples make kappa unstable; the UI always shows n alongside it.
 */
export function agreementStats(pairs: [string, string][]) {
  const n = pairs.length;
  if (!n) return { n, percentAgreement: null as number | null, cohensKappa: null as number | null };
  const agree = pairs.filter(([a, b]) => a === b).length;
  const po = agree / n;
  const cats = new Set(pairs.flat());
  let pe = 0;
  for (const c of cats) {
    const pa = pairs.filter(([a]) => a === c).length / n;
    const pb = pairs.filter(([, b]) => b === c).length / n;
    pe += pa * pb;
  }
  const kappa = pe === 1 ? null : (po - pe) / (1 - pe);
  return { n, percentAgreement: po, cohensKappa: kappa };
}

export function countBy<T extends string>(values: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
