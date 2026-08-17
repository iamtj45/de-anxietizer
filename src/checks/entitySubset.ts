import {
  formatSent, normalize, stripBlanks,
  type Check, type Extraction, type PriorMessage,
} from "../types";

/**
 * The load-bearing guardrail.
 *
 * Rule: every *specific* in the message — a number, a date, a proper noun —
 * must trace back to something the user actually wrote, or be a bracketed
 * blank for them to fill. A rewrite that reads beautifully and contains a
 * date that never happened is worse than sending nothing.
 *
 * Deliberately conservative about what counts as a "specific". It flags the
 * things that get quoted back at you in a dispute (dates, amounts, names,
 * places) and lets softer paraphrase through — `noNewCommitment` covers the
 * rest.
 */

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec";
const DAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";

/** Capitalised mid-sentence but not a proper noun. */
const NOT_PROPER = new Set([
  "i", "i'm", "i've", "i'll", "i'd",
  "hi", "hello", "hey", "dear", "thanks", "thank", "regards", "please",
  "the", "a", "an", "and", "but", "or", "if", "so", "as", "at", "by", "in",
  "on", "to", "for", "with", "without", "water", "roof",
]);

/** Pull everything from the message that reads as a hard fact. */
export function specifics(message: string): string[] {
  const text = stripBlanks(message);
  const found: string[] = [];

  // Anything containing a digit: dates, amounts, counts, times.
  // Trailing punctuation must be trimmed — "March 3." would otherwise yield
  // "3." and never match the whitelist, failing a message that is correct.
  for (const m of text.matchAll(/\$?\d[\d,.:/-]*\w*/g)) {
    found.push(m[0].replace(/[.,:;/-]+$/, ""));
  }

  // Named dates.
  for (const m of text.matchAll(new RegExp(`\\b(?:${MONTHS}|${DAYS})\\b`, "gi"))) {
    found.push(m[0]);
  }

  // Proper nouns: capitalised, not sentence-initial, not a common opener.
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const words = sentence.trim().split(/\s+/);
    words.forEach((word, i) => {
      const bare = word.replace(/^[^\p{L}]+/u, "").replace(/[^\p{L}']+$/u, "");
      if (!bare || i === 0) return;
      if (!/^\p{Lu}/u.test(bare)) return;
      if (NOT_PROPER.has(bare.toLowerCase())) return;
      found.push(bare);
    });
  }

  return [...new Set(found.map((f) => f.trim()).filter(Boolean))];
}

/**
 * Everything the user gave us, flattened into one haystack.
 *
 * Prior messages count. In a thread, "as I raised on 3 March" is not an
 * invention — the user really did send that, and the date is on the record.
 * Omitting them here would make the ladder impossible: every reference back
 * to an earlier message would be rejected as a fabricated fact.
 */
export function whitelist(extraction: Extraction, prior: PriorMessage[] = []): string {
  const { entities, claims, riskItems } = extraction;
  return normalize(
    [
      ...entities.dates,
      ...entities.amounts,
      ...entities.names,
      ...entities.places,
      ...entities.counts,
      ...entities.things,
      ...claims,
      ...riskItems.map((r) => r.quote),
      // Both renderings, so "3 March" and "2026-03-03" each resolve.
      ...prior.flatMap((p) => [p.text, p.sentAt, formatSent(p.sentAt)]),
    ].join(" | "),
  );
}

export const entitySubset: Check = ({ message, extraction, options }) => {
  const hay = whitelist(extraction, options.priorMessages ?? []);
  const invented = specifics(message).filter((s) => !hay.includes(normalize(s)));

  if (!invented.length) return [];

  const list = invented.join(", ");
  return [
    {
      check: "entity_subset",
      reason: `not traceable to the vent: ${list}`,
      repair:
        `You introduced specifics that do not appear in the original message: ${list}. ` +
        `Replace each one with a bracketed blank the user fills in, such as [date], ` +
        `[name] or [where]. Never guess a fact — a blank is always correct, an ` +
        `invented detail never is.`,
    },
  ];
};
