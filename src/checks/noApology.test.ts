import { describe, expect, it } from "vitest";
import { noApology } from "./noApology";
import { ctx, roofExtraction } from "./fixtures";
import type { Extraction } from "../types";

/**
 * SPEC — you implement `noApology` in ./noApology.ts to make these pass.
 *
 * Why this check exists: politeness and concession are different things.
 * "Sorry to bother you about the heat" turns a legal repair obligation into
 * a favour request. Apologising for someone else's failure is how a user
 * quietly gives away their position.
 */

/** A vent where the user genuinely is at fault. */
const atFault: Extraction = {
  ...roofExtraction,
  riskItems: [
    {
      quote: "I know I missed the deadline",
      kind: "admission_of_fault",
      note: "User accepts responsibility.",
    },
  ],
};

describe("noApology", () => {
  it("passes a message that makes its request plainly", () => {
    const clean = "The roof is still leaking. Please confirm a repair date by [date].";
    expect(noApology(ctx(clean))).toEqual([]);
  });

  it.each([
    "Sorry to bother you, but the roof is leaking.",
    "Sorry to trouble you about this again.",
    "I apologise for chasing, but the roof is still leaking.",
    "I hate to ask, but could you look at the roof?",
    "If it's not too much trouble, could you confirm a date?",
    "I know you're busy, but the roof is still leaking.",
    "I don't mean to be a pain about this.",
  ])("flags hedging: %s", (line) => {
    const fails = noApology(ctx(line));
    expect(fails).toHaveLength(1);
    expect(fails[0]!.check).toBe("no_apology");
  });

  it("is case and punctuation insensitive", () => {
    expect(noApology(ctx("SORRY TO BOTHER YOU!!"))).toHaveLength(1);
  });

  it("allows apology when the user opted in by including their own fault", () => {
    const line = "I apologise for missing the deadline. The draft is attached.";
    const opts = { includeRisks: ["I know I missed the deadline"] };
    expect(noApology(ctx(line, opts, atFault))).toEqual([]);
  });

  it("still flags apology when the fault exists but was NOT included", () => {
    const line = "Sorry to bother you about the draft.";
    expect(noApology(ctx(line, { includeRisks: [] }, atFault))).toHaveLength(1);
  });

  it("gives the model a concrete repair instruction", () => {
    const fails = noApology(ctx("Sorry to bother you about the roof."));
    expect(fails[0]!.repair.length).toBeGreaterThan(20);
    expect(fails[0]!.repair.toLowerCase()).toMatch(/apolog|sorry|hedge/);
  });
});
