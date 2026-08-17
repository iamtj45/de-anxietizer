import type { CheckContext, Extraction, RewriteOptions } from "../types";

/**
 * The roof case — our canonical test vent:
 *
 *   "Fix my roof or I'm withholding rent, you absolute ghost. I've messaged
 *    you twice and gotten nothing. There's water coming through and I'm done
 *    being polite about it."
 *
 * Note what is NOT here: no date, no name, no room, no amount. Any of those
 * appearing in a rewrite is an invention.
 */
export const roofExtraction: Extraction = {
  entities: {
    dates: [],
    amounts: [],
    names: [],
    places: [],
    counts: ["twice"],
    things: ["the roof"],
  },
  claims: ["the roof leaks", "water is coming through", "messaged twice with no reply"],
  riskItems: [
    {
      quote: "I'm withholding rent",
      kind: "legal_leverage",
      note: "Notice requirements vary by state.",
    },
    { quote: "you absolute ghost", kind: "insult", note: "Dropped." },
  ],
  readIntensity: "furious",
};

export const defaultOptions: RewriteOptions = {
  channel: "email",
  firmness: "level",
  recipient: "up",
  intent: "demand_timeline",
  includeRisks: [],
};

/** Build a CheckContext for a message, overriding options as needed. */
export function ctx(
  message: string,
  options: Partial<RewriteOptions> = {},
  extraction: Extraction = roofExtraction,
): CheckContext {
  return { message, extraction, options: { ...defaultOptions, ...options } };
}
