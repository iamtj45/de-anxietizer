import { normalize, type Check } from "../types";

/**
 * Politeness and concession are different things.
 *
 * "Sorry to bother you about the heat" turns a legal repair obligation into a
 * favour request. "Whenever you get a chance" turns a deadline into a wish.
 * Apologising for someone else's failure is how a user quietly gives away the
 * position they came here to hold — and because the result still *reads*
 * pleasant, they will not notice it happening.
 *
 * Same shape as ./cliche.ts: match families, aggregate into one failure.
 */

interface Hedge {
  name: string;
  re: RegExp;
}

/**
 * Patterns are written lowercase because normalize() lowercases first.
 * Each covers a family — `sorry to (bother|trouble|chase|disturb)` is four
 * phrasings in one line, which is the difference between a guardrail and a
 * game of whack-a-mole.
 */
export const HEDGES: Hedge[] = [
  { name: "sorry to bother", re: /\bsorry to (?:bother|trouble|chase|disturb|keep)\b/ },
  { name: "sorry for", re: /\bsorry (?:for|about) (?:the|this|another)\b/ },
  { name: "I apologise", re: /\bi apolog(?:i[sz]e|ies|y)\b/ },
  { name: "I hate to ask", re: /\bi hate to (?:ask|bother|chase|do this)\b/ },
  { name: "if it's not too much trouble", re: /\bif it'?s not too much (?:trouble|bother|hassle)\b/ },
  { name: "I know you're busy", re: /\bi know (?:you'?re|you are|things are) (?:busy|swamped|slammed|hectic)\b/ },
  { name: "I don't mean to be a pain", re: /\bi don'?t mean to be a (?:pain|nuisance|bother|burden)\b/ },
  { name: "hope I'm not bothering", re: /\bhope i'?m not (?:bothering|being a)\b/ },
  { name: "no rush", re: /\bno (?:rush|hurry|worries if)\b/ },
  // The quiet killer: it retracts the deadline in the same breath as setting it.
  { name: "whenever you get a chance", re: /\bwhenever (?:you |it )?(?:get|suits|works|have)\b/ },
];

export const noApology: Check = ({ message, extraction, options }) => {
  /**
   * The opt-in.
   *
   * Apology is legitimate in exactly one case: the user is genuinely at fault
   * AND chose to own it. Both halves matter. A vent can contain an admission
   * the user then decides to keep out of the message — in that case the
   * apology is still unearned and still gets flagged.
   */
  const ownedFault = extraction.riskItems.some(
    (r) => r.kind === "admission_of_fault" && options.includeRisks.includes(r.quote),
  );
  if (ownedFault) return [];

  const text = normalize(message);
  const hits = HEDGES.filter((h) => h.re.test(text));
  if (!hits.length) return [];

  const names = hits.map((h) => `"${h.name}"`).join(", ");
  return [
    {
      check: "no_apology",
      reason: `hedging: ${names}`,
      repair:
        `Remove this apology or hedge: ${names}. ` +
        `The reader has not done the user a favour, so do not thank or apologise ` +
        `for asking. State the situation and the request directly, and keep any ` +
        `deadline firm — do not soften it with "whenever suits you" or similar.`,
    },
  ];
};
