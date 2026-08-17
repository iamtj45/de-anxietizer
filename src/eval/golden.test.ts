import { describe, expect, it } from "vitest";
import { GOLDEN } from "./golden";

/**
 * The golden set is data, and data rots quietly. These guard the set itself
 * so a typo does not silently disable a case.
 */
describe("golden set", () => {
  it("has unique ids", () => {
    const ids = GOLDEN.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every case has a vent and a note", () => {
    for (const c of GOLDEN) {
      expect(c.vent.trim().length, c.id).toBeGreaterThan(10);
      expect(c.note.trim().length, c.id).toBeGreaterThan(10);
    }
  });

  it("every case asserts something", () => {
    for (const c of GOLDEN) {
      const assertions =
        (c.forbid?.length ?? 0) +
        (c.expectBlanks?.length ?? 0) +
        (c.expectHeldBack?.length ?? 0) +
        (c.expectKept?.length ?? 0);
      expect(assertions, `${c.id} asserts nothing`).toBeGreaterThan(0);
    }
  });

  it("forbid patterns carry a reason", () => {
    for (const c of GOLDEN) {
      for (const f of c.forbid ?? []) {
        expect(f.why.trim().length, c.id).toBeGreaterThan(5);
      }
    }
  });

  it("expectKept patterns actually appear in their own vent", () => {
    // If a fact is not in the vent, requiring it in the output would demand
    // an invention — the exact failure the set exists to catch.
    for (const c of GOLDEN) {
      for (const re of c.expectKept ?? []) {
        expect(re.test(c.vent), `${c.id}: ${re} is not in the vent`).toBe(true);
      }
    }
  });

  it("covers the adversarial categories", () => {
    const ids = GOLDEN.map((c) => c.id);
    for (const required of [
      "roof-no-facts",
      "real-date-and-amount",
      "threat-to-sue",
      "already-calm",
      "six-words-caps",
    ]) {
      expect(ids).toContain(required);
    }
  });
});
