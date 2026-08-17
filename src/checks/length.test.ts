import { describe, expect, it } from "vitest";
import { length, WORD_CAP } from "./length";
import { ctx } from "./fixtures";

const words = (n: number) => Array(n).fill("word").join(" ");

describe("length", () => {
  it("passes at exactly the cap", () => {
    expect(length(ctx(words(WORD_CAP.text), { channel: "text" }))).toEqual([]);
  });

  it("fails one word over", () => {
    const fails = length(ctx(words(WORD_CAP.text + 1), { channel: "text" }));
    expect(fails).toHaveLength(1);
    expect(fails[0]!.check).toBe("length");
  });

  it("applies a different cap per channel", () => {
    const sixty = words(60);
    expect(length(ctx(sixty, { channel: "text" }))).toHaveLength(1);
    expect(length(ctx(sixty, { channel: "email" }))).toEqual([]);
  });

  it("tells the model the actual numbers", () => {
    const fails = length(ctx(words(50), { channel: "text" }));
    expect(fails[0]!.repair).toContain("50");
    expect(fails[0]!.repair).toContain("40");
  });
});
