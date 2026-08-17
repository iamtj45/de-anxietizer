import { describe, expect, it } from "vitest";
import { FakeAdapter } from "./model/fake";
import { MAX_ATTEMPTS, findBlanks, rewrite, tidy } from "./pipeline";
import type { RewriteOptions } from "./types";

const VENT =
  "Fix my roof or I'm withholding rent, you absolute ghost. I've messaged you twice and gotten nothing.";

const EXTRACTION = {
  entities: { dates: [], amounts: [], names: [], places: [], counts: ["twice"], things: ["the roof"] },
  claims: ["the roof leaks", "messaged twice with no reply"],
  riskItems: [
    { quote: "I'm withholding rent", kind: "legal_leverage", note: "Varies by state." },
    { quote: "you absolute ghost", kind: "insult", note: "Dropped." },
  ],
  readIntensity: "furious",
};

const OPTIONS: RewriteOptions = {
  channel: "email",
  firmness: "level",
  recipient: "up",
  intent: "demand_timeline",
  includeRisks: [],
};

const CLEAN =
  "Hi [name], the roof has been leaking since [when] and I've raised it twice " +
  "without a repair date. Please confirm a timeline by [date].";

const INVENTED =
  "Hi [name], the roof leak we discussed last Tuesday is worsening. " +
  "Please confirm a timeline by [date].";

describe("tidy", () => {
  it("strips a preamble and surrounding quotes", () => {
    expect(tidy('Here is your message:\n"The roof is leaking."')).toBe("The roof is leaking.");
  });
});

describe("findBlanks", () => {
  it("returns each slot once", () => {
    expect(findBlanks("a [date] b [date] c [name]")).toEqual(["[date]", "[name]"]);
  });
});

describe("rewrite", () => {
  it("returns on the first attempt when the message is clean", async () => {
    const model = new FakeAdapter({ jsons: [EXTRACTION], texts: [CLEAN] });
    const result = await rewrite(model, VENT, OPTIONS);

    expect(result.attempts).toBe(1);
    expect(result.failures).toEqual([]);
    expect(result.blocked).toBe(false);
    expect(result.blanks).toEqual(["[name]", "[when]", "[date]"]);
  });

  it("repairs an invented fact and feeds the reason back to the model", async () => {
    const model = new FakeAdapter({ jsons: [EXTRACTION], texts: [INVENTED, CLEAN] });
    const result = await rewrite(model, VENT, OPTIONS);

    expect(result.attempts).toBe(2);
    expect(result.failures).toEqual([]);

    // The second write call must carry the specific complaint, not a generic retry.
    const second = model.calls.filter((c) => c.kind === "text")[1]!;
    expect(second.call.user).toMatch(/previous attempt failed/i);
    expect(second.call.user).toMatch(/Tuesday/);
  });

  it("gives up after MAX_ATTEMPTS and reports what survived", async () => {
    const model = new FakeAdapter({
      jsons: [EXTRACTION],
      texts: Array(MAX_ATTEMPTS).fill(INVENTED),
    });
    const result = await rewrite(model, VENT, OPTIONS);

    expect(result.attempts).toBe(MAX_ATTEMPTS);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures[0]!.check).toBe("entity_subset");
    // Not blocking — the user still sees the message, with the warning.
    expect(result.blocked).toBe(false);
  });

  it("blocks when a user decision could not be honoured", async () => {
    const model = new FakeAdapter({
      jsons: [EXTRACTION],
      // User asked to include the leverage; every attempt omits it.
      texts: Array(MAX_ATTEMPTS).fill(CLEAN),
    });
    const result = await rewrite(model, VENT, {
      ...OPTIONS,
      includeRisks: ["I'm withholding rent"],
    });

    expect(result.blocked).toBe(true);
    expect(result.failures.some((f) => f.check === "risk_accounted")).toBe(true);
  });

  it("surfaces held-back risks but never insults", async () => {
    const model = new FakeAdapter({ jsons: [EXTRACTION], texts: [CLEAN] });
    const result = await rewrite(model, VENT, OPTIONS);

    expect(result.heldBack.map((r) => r.quote)).toEqual(["I'm withholding rent"]);
  });

  it("survives a model that returns a partial extraction", async () => {
    const model = new FakeAdapter({ jsons: [{ claims: ["roof leaks"] }], texts: [CLEAN] });
    const result = await rewrite(model, VENT, OPTIONS);

    expect(result.extraction.entities.dates).toEqual([]);
    expect(result.extraction.riskItems).toEqual([]);
    expect(result.extraction.readIntensity).toBe("fed_up");
  });
});
