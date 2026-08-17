import type { Check, CheckContext, CheckFailure } from "../types";
import { cliche } from "./cliche";
import { ctaPresent } from "./ctaPresent";
import { entitySubset } from "./entitySubset";
import { length } from "./length";
import { noApology } from "./noApology";
import { noNewCommitment } from "./noNewCommitment";
import { riskAccounted } from "./riskAccounted";
import { subjectPresent } from "./subjectPresent";

/**
 * The guardrail registry.
 *
 * Order matters only for readability of the report — every check runs on
 * every pass, so the model gets all its failures in one repair instruction
 * rather than discovering them one round-trip at a time.
 *
 * riskAccounted is the only one that can *block* rather than repair: if we
 * cannot honour an explicit include/exclude decision, showing the message
 * anyway would misrepresent what the user is about to send.
 */
export const CHECKS: Check[] = [
  entitySubset,
  riskAccounted,
   subjectPresent,
  noNewCommitment,
  noApology,
  ctaPresent,
  cliche,
  length,
];

/** Failures that must never be shipped, even with warnings. */
export const BLOCKING = new Set(["risk_accounted"]);

export function hasBlocking(failures: CheckFailure[]): boolean {
  return failures.some((f) => BLOCKING.has(f.check));
}

/** Run every guardrail. Empty array means the message is clean. */
export function check(ctx: CheckContext): CheckFailure[] {
  return CHECKS.flatMap((c) => c(ctx));
}

/** Collapse failures into the feedback block appended to the repair prompt. */
export function repairInstruction(failures: CheckFailure[]): string {
  return failures.map((f, i) => `${i + 1}. ${f.repair}`).join("\n");
}

export {
  cliche,
  ctaPresent,
  entitySubset,
  length,
  noApology,
  noNewCommitment,
  riskAccounted,
    subjectPresent,
};
