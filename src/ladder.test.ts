import { describe, expect, it } from "vitest";
import { entitySubset } from "./checks/entitySubset";
import { ctx } from "./checks/fixtures";
import { writeCall } from "./prompts/write";
import { formatSent, type PriorMessage, type RewriteOptions } from "./types";

const PRIOR: PriorMessage[] = [
  {
    sentAt: "2026-03-03",
    text: "Hi, the roof has been leaking since last week. Please confirm a repair date.",
    firmness: "level",
  },
  {
    sentAt: "2026-03-17",
    text: "Following on from 3 March — still no repair date. Please respond by Friday.",
    firmness: "firm",
  },
];

describe("escalation ladder", () => {
  it("treats a prior message's date as established fact, not an invention", () => {
    const msg = "I raised this on 3 March and again on 17 March. I still have no repair date.";

    // Without the thread it reads as four fabricated specifics.
    expect(entitySubset(ctx(msg)).length).toBe(1);

    // With it, the dates are on the record.
    expect(entitySubset(ctx(msg, { priorMessages: PRIOR }))).toEqual([]);
  });

  it("still rejects a date that is in neither the vent nor the thread", () => {
    const msg = "I raised this on 3 March and you promised a fix by 1 April.";
    const fails = entitySubset(ctx(msg, { priorMessages: PRIOR }));
    expect(fails).toHaveLength(1);
    expect(fails[0]!.reason).toMatch(/April/);
  });

  it("puts the history and its position in the prompt", () => {
    const call = writeCall(
      { entities: { dates: [], amounts: [], names: [], places: [], counts: [], things: [] }, claims: [], riskItems: [], readIntensity: "fed_up" },
      { channel: "email", firmness: "firm", recipient: "up", intent: "demand_timeline", includeRisks: [], priorMessages: PRIOR },
    );

    expect(call.user).toMatch(/message 3 in an ongoing thread/i);
    expect(call.user).toContain(formatSent("2026-03-03"));
    expect(call.user).toContain("Please respond by Friday.");
    expect(call.user).toMatch(/do not repeat the earlier wording/i);
  });

  it("adds nothing to the prompt for a first message", () => {
    const base = {
      entities: { dates: [], amounts: [], names: [], places: [], counts: [], things: [] },
      claims: [], riskItems: [], readIntensity: "fed_up" as const,
    };
    const opts: RewriteOptions = {
      channel: "email", firmness: "level", recipient: "up",
      intent: "demand_timeline", includeRisks: [],
    };

    expect(writeCall(base, opts).user).not.toMatch(/ongoing thread/i);
  });
});

describe("formatSent", () => {
  it("renders an ISO date readably", () => {
    expect(formatSent("2026-03-03")).toBe("3 March");
  });

  it("passes through anything unparseable", () => {
    expect(formatSent("not a date")).toBe("not a date");
  });
});
