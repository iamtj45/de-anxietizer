import { describe, expect, it } from "vitest";
import { keywords, riskAccounted } from "./riskAccounted";
import { ctx } from "./fixtures";

const CLEAN = "Hi [name], the roof has been leaking since [when]. Please confirm a repair date by [date].";
const WITH_LEVERAGE =
  CLEAN + " If it is not scheduled by then, I will be withholding rent as permitted in [state].";

describe("keywords()", () => {
  it("keeps distinctive words and drops filler", () => {
    const keys = keywords("I'm withholding rent");
    expect(keys).toContain("withhold");
    expect(keys).toContain("rent");
    expect(keys).not.toContain("im");
  });
});

describe("riskAccounted", () => {
  it("passes when a held-back item stays out", () => {
    expect(riskAccounted(ctx(CLEAN, { includeRisks: [] }))).toEqual([]);
  });

  it("passes when an included item is actually expressed", () => {
    const opts = { includeRisks: ["I'm withholding rent"] };
    expect(riskAccounted(ctx(WITH_LEVERAGE, opts))).toEqual([]);
  });

  it("fails when the user asked to include leverage and it was dropped", () => {
    const fails = riskAccounted(ctx(CLEAN, { includeRisks: ["I'm withholding rent"] }));
    expect(fails).toHaveLength(1);
    expect(fails[0]!.reason).toMatch(/dropped an included item/);
  });

  it("fails when a held-back item leaks in anyway", () => {
    const fails = riskAccounted(ctx(WITH_LEVERAGE, { includeRisks: [] }));
    expect(fails).toHaveLength(1);
    expect(fails[0]!.reason).toMatch(/leaked a held-back item/);
  });

  it("does not mistake an incidental mention for the threat", () => {
    const msg = CLEAN + " My rent is paid up to date.";
    expect(riskAccounted(ctx(msg, { includeRisks: [] }))).toEqual([]);
  });

  it("always blocks an insult, whatever the user selected", () => {
    const msg = "You absolute ghost, the roof is still leaking.";
    for (const includeRisks of [[], ["you absolute ghost"]]) {
      const fails = riskAccounted(ctx(msg, { includeRisks }));
      expect(fails.some((f) => f.reason.includes("insult"))).toBe(true);
    }
  });
});
