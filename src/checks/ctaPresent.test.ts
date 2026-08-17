import { describe, expect, it } from "vitest";
import { ctaPresent } from "./ctaPresent";
import { ctx } from "./fixtures";

describe("ctaPresent", () => {
  it("passes a demand_timeline message with both elements", () => {
    const msg = "The roof has been leaking since [when]. Please confirm a repair timeline by [date].";
    expect(ctaPresent(ctx(msg, { intent: "demand_timeline" }))).toEqual([]);
  });

  it("fails a message that only describes the problem", () => {
    const fails = ctaPresent(ctx("The roof is leaking and water is coming through.", { intent: "demand_timeline" }));
    expect(fails).toHaveLength(1);
    expect(fails[0]!.check).toBe("cta_present");
    expect(fails[0]!.reason).toMatch(/request/);
    expect(fails[0]!.reason).toMatch(/deadline/);
  });

  it("names only the missing half", () => {
    // Has the request verb, no deadline anchor.
    const fails = ctaPresent(ctx("Please confirm the leak has been logged.", { intent: "demand_timeline" }));
    expect(fails[0]!.reason).toMatch(/deadline or timeline/);
    expect(fails[0]!.reason).not.toMatch(/explicit request/);
  });

  it("accepts a bracketed blank as a satisfied deadline", () => {
    const msg = "I need this scheduled by [date].";
    expect(ctaPresent(ctx(msg, { intent: "demand_timeline" }))).toEqual([]);
  });

  it("handles dispute_charge", () => {
    const good = "The $40 charge on [date] is wrong. Please refund it.";
    expect(ctaPresent(ctx(good, { intent: "dispute_charge" }))).toEqual([]);
    const bad = "I am unhappy with the service I received.";
    expect(ctaPresent(ctx(bad, { intent: "dispute_charge" }))).toHaveLength(1);
  });

  it("handles decline", () => {
    expect(ctaPresent(ctx("I can't take this on right now.", { intent: "decline" }))).toEqual([]);
    expect(ctaPresent(ctx("That sounds like an interesting project.", { intent: "decline" }))).toHaveLength(1);
  });

  it("handles chase_reply", () => {
    const good = "I raised this on [date] and have not had a reply. Please respond by [date].";
    expect(ctaPresent(ctx(good, { intent: "chase_reply" }))).toEqual([]);
  });
});
