import { describe, expect, it } from "vitest";
import { cliche } from "./cliche";
import { ctx } from "./fixtures";

describe("cliche", () => {
  it("passes clean copy", () => {
    expect(cliche(ctx("The roof is leaking. Please confirm a repair date."))).toEqual([]);
  });

  // The whole point of families over literals.
  it.each([
    "I hope this email finds you well.",
    "Hope this message finds you well.",
    "Hope you're doing well!",
  ])("catches the whole 'finds you well' family: %s", (line) => {
    expect(cliche(ctx(line))).toHaveLength(1);
  });

  it("catches filler regardless of case and punctuation", () => {
    expect(cliche(ctx("JUST FOLLOWING UP on this!"))).toHaveLength(1);
  });

  it("allows 'per my last' when the point is a paper trail", () => {
    const line = "Per my last email, the roof is still leaking.";
    expect(cliche(ctx(line, { intent: "chase_reply" }))).toEqual([]);
    expect(cliche(ctx(line, { intent: "decline" }))).toHaveLength(1);
  });

  it("names what to remove in the repair instruction", () => {
    const fails = cliche(ctx("Just following up to touch base."));
    expect(fails[0]!.repair).toMatch(/just following up/i);
    expect(fails[0]!.repair).toMatch(/touch base/i);
  });
});
