import { normalize, type Check } from "../types";

/**
 * A message that never names what it is about is polite and useless.
 *
 * This is a real bug we hit: the vent said "could you take a look at the
 * migration script" and the output came back as
 *
 *     "I'm following up on the issue we discussed previously."
 *
 * Six of seven guardrails passed it. The recipient has no idea what it means.
 *
 * The rule: if the vent named a subject, the message must mention at least one
 * of them. If it named none, there is nothing to require.
 */

/** Articles and possessives carry no subject on their own. */
const FILLER = new Set([
  "the", "a", "an", "my", "our", "your", "their", "this", "that", "its", "of",
]);

/**
 * The words worth matching on for one subject.
 *
 * Words over three characters are distinctive enough to stand alone. When a
 * subject is nothing but short ones — "the app", "the fee", "the API" — that
 * filter empties the list, and `.some` over an empty list is false: the check
 * failed messages that named their subject exactly, and no repair could ever
 * clear it. Keep the short words in that case.
 */
function subjectWords(subject: string): string[] {
  const words = normalize(subject)
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w));

  const distinctive = words.filter((w) => w.length > 3);
  return distinctive.length ? distinctive : words;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/**
 * Boundary at the start only, so "migration" still matches "migrations" while
 * "app" no longer matches "happened" — the false pass a plain substring test
 * would let through now that short words can carry a subject.
 */
function mentions(text: string, word: string): boolean {
  return new RegExp(String.raw`\b` + escape(word)).test(text);
}

export const subjectPresent: Check = ({ message, extraction }) => {
  const subjects = extraction.entities.things
    .map((subject) => ({ subject, words: subjectWords(subject) }))
    .filter((s) => s.words.length);

  if (!subjects.length) return [];

  const text = normalize(message);
  if (subjects.some(({ words }) => words.some((w) => mentions(text, w)))) return [];

  const named = subjects.map((s) => s.subject).join(", ");
  return [
    {
      check: "subject_present",
      reason: `never names the subject: ${named}`,
      repair:
        `The message never says what it is about. Name it in the opening ` +
        `sentence, using the writer's own words: ${named}. ` +
        `A polite message the reader cannot act on is a failure.`,
    },
  ];
};
