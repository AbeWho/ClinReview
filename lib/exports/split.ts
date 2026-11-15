import { createHash } from "node:crypto";

export type Split = "train" | "validation" | "test";
export const SPLIT_RATIOS = { train: 0.7, validation: 0.15, test: 0.15 } as const;
export const SPLIT_ALGORITHM = "sha256(seed + ':' + case_group_id) -> first 8 hex digits / 2^32 -> [0,0.70)=train, [0.70,0.85)=validation, [0.85,1)=test";

/**
 * Deterministic split by CASE GROUP (not by response row): every response derived from the same
 * scenario lands in the same split, so near-duplicates cannot leak from train into test.
 * Same seed + same group => same split, every time, on any machine.
 */
export function assignSplit(caseGroupId: string, seed: string): Split {
  const hex = createHash("sha256").update(`${seed}:${caseGroupId}`).digest("hex").slice(0, 8);
  const bucket = parseInt(hex, 16) / 0x1_0000_0000;
  if (bucket < SPLIT_RATIOS.train) return "train";
  if (bucket < SPLIT_RATIOS.train + SPLIT_RATIOS.validation) return "validation";
  return "test";
}
