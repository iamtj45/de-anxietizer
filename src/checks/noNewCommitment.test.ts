import { describe, expect, it } from "vitest";
import { noNewCommitment } from "./noNewCommitment";
import { ctx, roofExtraction } from "./fixtures";
import type { Extraction } from "../types";

describe("noNewCommitment", () => {
  it("passes a message that only makes a request", () => {
    const msg = "The roof is leaking. Please confirm a repair date by [date].";
    expect(noNewCommitment(ctx(msg))).toEqual([]);
  });

  it.each([
    "I'll send the documents by [date].",
    "I will send the documents by [date].",
    "We can send the documents over.",
    "I'm happy to send whatever you need.",
  ])("catches an invented delivery promise: %s", (line) => {
    const fails = noNewCommitment(ctx(line));
    expect(fails).toHaveLength(1);
    expect(fails[0]!.check).toBe("no_new_commitment");
    expect(fails[0]!.reason).toMatch(/send/);
  });

  it("allows a promise the user actually made", () => {
    const offered: Extraction = {
      ...roofExtraction,
      claims: [...roofExtraction.claims, "I said I would send photos of the damage"],
    };
    expect(noNewCommitment(ctx("I'll send photos on [date].", {}, offered))).toEqual([]);
  });

  it("stems loosely so 'sending' matches a vent that said 'send'", () => {
    const offered: Extraction = { ...roofExtraction, claims: ["I offered to send photos"] };
    expect(noNewCommitment(ctx("I'll be sending photos.", {}, offered))).toEqual([]);
  });

  it("does not flag leverage — that belongs to riskAccounted", () => {
    const msg = "If it is not scheduled by [date], I'll be reviewing my options as a tenant.";
    expect(noNewCommitment(ctx(msg))).toEqual([]);
  });

  it("ignores non-delivery verbs", () => {
    expect(noNewCommitment(ctx("I will need this resolved by [date]."))).toEqual([]);
  });
});
