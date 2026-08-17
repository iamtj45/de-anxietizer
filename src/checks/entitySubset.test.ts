import { describe, expect, it } from "vitest";
import { entitySubset, specifics } from "./entitySubset";
import { ctx, roofExtraction } from "./fixtures";

describe("specifics()", () => {
  it("finds digits, named dates and proper nouns", () => {
    const found = specifics("Hi Dave, the leak started March 3 and cost me $400.");
    expect(found).toContain("Dave");
    expect(found).toContain("March");
    expect(found).toContain("3");
    expect(found).toContain("$400");
  });

  it("ignores bracketed blanks", () => {
    expect(specifics("Please confirm by [date].")).toEqual([]);
  });

  it("ignores sentence-initial capitals and common openers", () => {
    expect(specifics("Hi there. Water is coming through. Please confirm.")).toEqual([]);
  });
});

describe("entitySubset", () => {
  it("passes a message built only from blanks", () => {
    const message =
      "Hi [name], the roof has been leaking since [when] and I've raised it " +
      "twice without a repair date. Please confirm a timeline by [date].";
    expect(entitySubset(ctx(message))).toEqual([]);
  });

  it("catches the fabrications from the original mockup output", () => {
    const message =
      "Hi [name], the roof leak we discussed last Tuesday is worsening. " +
      "Water intrusion continues in the master bedroom.";
    const fails = entitySubset(ctx(message));

    expect(fails).toHaveLength(1);
    expect(fails[0]!.check).toBe("entity_subset");
    // "Tuesday" was never in the vent.
    expect(fails[0]!.reason).toMatch(/Tuesday/i);
  });

  it("catches an invented amount", () => {
    const fails = entitySubset(ctx("I am withholding $1,800 until it is fixed."));
    expect(fails[0]!.reason).toMatch(/\$1,800/);
  });

  it("allows a specific the user actually supplied", () => {
    const withDate = {
      ...roofExtraction,
      entities: { ...roofExtraction.entities, dates: ["March 3"] },
    };
    const message = "The roof has been leaking since March 3.";
    expect(entitySubset(ctx(message, {}, withDate))).toEqual([]);
  });

  it("hands the model a usable repair instruction", () => {
    const fails = entitySubset(ctx("The leak started Tuesday."));
    expect(fails[0]!.repair).toMatch(/bracketed blank/i);
  });
});
