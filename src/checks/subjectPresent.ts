import { normalize, type Check } from "../types";

/**
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │  YOUR TASK. Fill in the five TODOs below. Everything else is written.  │
 * │  Run `npm run watch` first — it re-runs the tests every time you save. │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * WHY THIS EXISTS
 * A message that never names what it is about is polite and useless. This is
 * a real bug we hit: the vent said "could you take a look at the migration
 * script" and the output came back as
 *
 *     "I'm following up on the issue we discussed previously."
 *
 * Six of seven guardrails passed it. The recipient has no idea what it means.
 *
 * THE RULE
 * If the vent named a subject, the message must mention at least one of them.
 * If it named none, there is nothing to require.
 */
export const subjectPresent: Check = ({ message, extraction }) => {
  // ── TODO 1 ──────────────────────────────────────────────────────────────
  // The subjects the extractor found live on `extraction.entities.things`.
  // It is a string[], e.g. ["the migration script"].
  // Put it in a const called `subjects`.
  //
  const subjects = extraction.entities.things;
  if(subjects.length==0) return [];
  const text=normalize(message);
  const found = subjects.some((subject) =>
    normalize(subject)
    .split(/\s+/)
    .filter((word)=>word.length>3)
    .some((word)=>text.includes(word)),
   );

   if(found) return [];
   return[{
    check: "subject_present",
      reason: `never names the subject: ${subjects.join(", ")}`,
      repair:
        `The message never says what it is about. Name it in the opening ` +
        `sentence, using the writer's own words: ${subjects.join(", ")}. ` +
        `A polite message the reader cannot act on is a failure.`,
    },
  ];
};
   
