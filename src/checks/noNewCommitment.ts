import { normalize, type Check } from "../types";

/**
 * The mirror image of entitySubset.
 *
 * That check stops the model inventing facts about the *past*. This one stops
 * it inventing promises about the *future* — "I'll send the documents by
 * Friday" in a message from someone who never offered to send anything. The
 * user then discovers they committed to a deadline by reading their own sent
 * mail.
 *
 * Scope is deliberately narrow: a closed list of verbs that mean "I will hand
 * something over". Forward-looking statements that are not deliveries —
 * "I'll be reviewing my options" — are leverage, not commitments, and belong
 * to riskAccounted instead.
 */

/** Verbs where "I'll <verb>" puts the user on the hook. */
const DELIVERY_VERBS = [
  "send", "sending", "provide", "share", "pay", "paying", "submit", "deliver",
  "complete", "finish", "attach", "forward", "call", "phone", "email",
  "come", "drop", "bring", "sign", "return", "refund", "fix", "repair",
  "arrange", "book", "confirm", "reschedule", "resend", "upload",
];

// "I'll send", "I will send", "we can send", "I'm happy to send".
// Alternatives carry no leading space — the greedy \s* before them would eat
// it and the branch would never match.
const COMMIT_RE = new RegExp(
  String.raw`\b(?:i|we)\s*(?:'ll|will|shall|can|could|'m happy to|am happy to|'d be happy to|would be happy to)\s+(?:be\s+|go ahead and\s+)?(\w+)`,
  "g",
);

export const noNewCommitment: Check = ({ message, extraction, options }) => {
  const text = normalize(message);

  /** What the user actually said, plus any leverage they chose to include. */
  const said = normalize(
    [
      ...extraction.claims,
      ...extraction.riskItems
        .filter((r) => options.includeRisks.includes(r.quote))
        .map((r) => r.quote),
    ].join(" | "),
  );

  const promised = new Set<string>();
  for (const m of text.matchAll(COMMIT_RE)) {
    const verb = m[1];
    if (!verb) continue;
    if (!DELIVERY_VERBS.includes(verb)) continue;
    // Stem loosely so "sending" matches a vent that said "send".
    const stem = verb.replace(/(?:ing|ed)$/, "");
    if (said.includes(stem)) continue;
    promised.add(verb);
  }

  if (!promised.size) return [];

  const list = [...promised].join(", ");
  return [
    {
      check: "no_new_commitment",
      reason: `promises the user never made: ${list}`,
      repair:
        `You committed the user to something they did not offer: "${list}". ` +
        `Remove the promise. The user is making a request, not volunteering ` +
        `work. Never add an obligation, a deadline, or an offer that is not ` +
        `in the original message.`,
    },
  ];
};
