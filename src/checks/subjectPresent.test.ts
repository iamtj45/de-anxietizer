import { describe, expect, it } from "vitest";
import { subjectPresent } from "./subjectPresent";
import { ctx, roofExtraction } from "./fixtures";
import type { Extraction } from "../types";

/**
 * SPEC — implement `subjectPresent` in ./subjectPresent.ts until these pass.
 *
 * This is a real gap we hit during the eval. The vent said "could you take a
 * look at the migration script", and the output came back:
 *
 *   "I'm following up on the issue we discussed previously. I need
 *    clarification on what occurred and how it will be addressed."
 *
 * Perfectly polite, and completely useless — the recipient has no idea what
 * it is about. The message must name its subject.
 */

const scriptVent: Extraction = {
  entities: {
    dates: [], amounts: [], names: ["Priya"], places: [], counts: [],
    things: ["the migration script"],
  },
  claims: ["asked Priya to look at the migration script"],
  riskItems: [],
  readIntensity: "mild",
};

describe("subjectPresent", () => {
  it("passes when the message names the subject", () => {
    const msg = "Priya, could you take a look at the migration script by [date]?";
    expect(subjectPresent(ctx(msg, {}, scriptVent))).toEqual([]);
  });

  it("passes on a partial match — 'migration' is enough", () => {
    const msg = "Priya, any update on the migration by [date]?";
    expect(subjectPresent(ctx(msg, {}, scriptVent))).toEqual([]);
  });

  it("fails when the subject has been generalised away", () => {
    const msg = "I'm following up on the issue we discussed. Please reply by [date].";
    const fails = subjectPresent(ctx(msg, {}, scriptVent));

    expect(fails).toHaveLength(1);
    expect(fails[0]!.check).toBe("subject_present");
    expect(fails[0]!.reason).toMatch(/migration script/);
  });

  it("passes when the vent named no subject — nothing to require", () => {
    const noThings: Extraction = {
      ...scriptVent,
      entities: { ...scriptVent.entities, things: [] },
    };
    const msg = "I'm following up on the issue we discussed. Please reply by [date].";
    expect(subjectPresent(ctx(msg, {}, noThings))).toEqual([]);
  });

  it("needs only one subject when the vent named several", () => {
    const two: Extraction = {
      ...scriptVent,
      entities: { ...scriptVent.entities, things: ["the roof", "the boiler"] },
    };
    expect(subjectPresent(ctx("The roof is still leaking. Confirm by [date].", {}, two))).toEqual([]);
  });

  it("is case insensitive", () => {
    expect(subjectPresent(ctx("THE MIGRATION SCRIPT is broken.", {}, scriptVent))).toEqual([]);
  });

  it("gives the model a usable repair instruction", () => {
    const fails = subjectPresent(ctx("Please reply by [date].", {}, scriptVent));
    expect(fails[0]!.repair).toMatch(/migration script/);
    expect(fails[0]!.repair.length).toBeGreaterThan(30);
  });

  it("works with the roof fixture", () => {
    // roofExtraction.entities.things is ["the roof"]
    expect(subjectPresent(ctx("The roof is leaking.", {}, roofExtraction))).toEqual([]);
    expect(subjectPresent(ctx("There is an ongoing issue.", {}, roofExtraction))).toHaveLength(1);
  });
});
