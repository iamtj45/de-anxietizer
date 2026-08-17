import type { RewriteOptions } from "../types";

/**
 * The golden set — the thing that decides arguments.
 *
 * These are end-to-end cases: a raw vent goes in, the real pipeline runs, and
 * we assert on the message that comes out. Unlike the check unit tests, there
 * is no hand-written Extraction here — producing that is the model's job and
 * part of what we are grading.
 *
 * Roughly a third are written specifically to break it. A case that the
 * pipeline has never failed is not earning its place.
 */
export interface GoldenCase {
  id: string;
  scenario:
    | "landlord" | "boss" | "coworker" | "customer"
    | "vendor" | "insurance" | "neighbour";
  vent: string;
  options: Partial<RewriteOptions>;
  /** Patterns that must NOT appear. Usually facts the vent never contained. */
  forbid?: { why: string; re: RegExp }[];
  /** Slot names we expect to be left blank because the vent lacks the fact. */
  expectBlanks?: string[];
  /** Risk quotes that must be surfaced for a decision, never silently dropped. */
  expectHeldBack?: string[];
  /** Facts that must survive into the message, verbatim where quoted. */
  expectKept?: RegExp[];
  note: string;
}

export const GOLDEN: GoldenCase[] = [
  // ---------------------------------------------------------------- invention
  {
    id: "roof-no-facts",
    scenario: "landlord",
    vent: "Fix my roof or I'm withholding rent, you absolute ghost. I've messaged you twice and gotten nothing. There's water coming through and I'm done being polite about it.",
    options: { channel: "email", intent: "demand_timeline", recipient: "up" },
    forbid: [
      { why: "no date was ever given", re: /\b(?:last|next)?\s?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i },
      { why: "no room was ever named", re: /\b(?:bedroom|kitchen|bathroom|living room|attic)\b/i },
      { why: "no severity assessment was given", re: /\bstructural\b/i },
    ],
    expectBlanks: ["when", "date"],
    expectHeldBack: ["withholding rent"],
    expectKept: [/twice/i],
    note: "The founding case. Four fabrications in the original mockup output.",
  },
  {
    id: "vague-thing-broke",
    scenario: "vendor",
    vent: "the thing broke again and nobody has called me back. this is the third time. sort it out",
    options: { channel: "email", intent: "chase_reply", recipient: "out" },
    forbid: [{ why: "the vent never says what 'the thing' is", re: /\b(?:boiler|printer|laptop|unit|machine)\b/i }],
    expectBlanks: ["what"],
    expectKept: [/third time|three times/i],
    note: "Must not resolve an ambiguous noun into a specific product.",
  },
  {
    id: "six-words-caps",
    scenario: "customer",
    vent: "WHERE IS MY REFUND??? ITS BEEN WEEKS",
    options: { channel: "chat", intent: "chase_reply", recipient: "out" },
    forbid: [
      { why: "no amount was given", re: /\$\s?\d/ },
      { why: "no order number was given", re: /\border\s*#?\s*\d/i },
    ],
    expectBlanks: ["amount", "order"],
    note: "Almost no material. Must produce a usable message of blanks, not padding.",
  },

  // ------------------------------------------------------------- preservation
  {
    id: "real-date-and-amount",
    scenario: "insurance",
    vent: "I filed the claim on March 3 and you took $1,847 in premiums since. Still nothing. I want an answer.",
    options: { channel: "email", intent: "chase_reply", recipient: "out" },
    expectKept: [/March 3/, /\$1,847/],
    forbid: [{ why: "amount must not be rounded or restated", re: /\$1,800\b|\$1,850\b/ }],
    note: "Exact figures survive verbatim. No rounding, no rephrasing.",
  },
  {
    id: "unusual-name",
    scenario: "boss",
    vent: "Siobhán keeps reassigning my tickets without telling me and I'm sick of finding out from the board.",
    options: { channel: "chat", intent: "chase_reply", recipient: "up" },
    expectKept: [/Siobhán/],
    note: "Spelling and diacritics preserved exactly.",
  },
  {
    id: "two-asks",
    scenario: "vendor",
    vent: "You've charged me twice for January AND the replacement part still hasn't shipped. I need the refund and a ship date.",
    options: { channel: "email", intent: "dispute_charge", recipient: "out" },
    expectKept: [/refund/i, /ship/i],
    note: "Two distinct requests. Dropping either is a failure.",
  },

  // -------------------------------------------------------------------- risk
  {
    id: "threat-to-sue",
    scenario: "landlord",
    vent: "If this isn't fixed I'm calling a lawyer and taking you to court. I've had enough.",
    options: { channel: "email", intent: "demand_timeline", recipient: "up" },
    expectHeldBack: ["lawyer"],
    forbid: [{ why: "legal threat must not go out unasked", re: /\b(?:court|sue|lawyer|attorney)\b/i }],
    note: "Surfaced for a decision, not softened into the message by default.",
  },
  {
    id: "admission-of-fault",
    scenario: "boss",
    vent: "Look I know I missed the deadline, I get it, but nobody told me the spec changed on Tuesday and I'm not taking the fall for this alone.",
    options: { channel: "email", intent: "ask_extension", recipient: "up" },
    expectKept: [/Tuesday/],
    expectHeldBack: ["missed the deadline"],
    note: "Fault preserved, never amplified. Must not add apology beyond what was admitted.",
  },
  {
    id: "rent-withholding-included",
    scenario: "landlord",
    vent: "No heat for nine days. I've called four times. I'm withholding rent until it's fixed.",
    options: { channel: "email", intent: "demand_timeline", recipient: "up", includeRisks: ["I'm withholding rent"] },
    // The count is the fact; "four times" vs "four phone calls" is phrasing.
    expectKept: [/nine days|9 days/i, /\bfour\b|\b4\b/i],
    note: "User opted IN. The leverage must actually appear, phrased as a position not a blurt.",
  },

  // ------------------------------------------------------------------ register
  {
    id: "already-calm",
    scenario: "coworker",
    vent: "Hi Priya, could you take a look at the migration script when you get a chance? No rush.",
    options: { channel: "chat", intent: "chase_reply", recipient: "side" },
    expectKept: [/Priya/, /migration script/i],
    forbid: [{ why: "must not inflate a calm note into corporate register", re: /\bpursuant\b|\bkindly be advised\b/i }],
    note: "Near passthrough. Over-formalising a friendly message is a failure.",
  },
  {
    id: "difficult-customer",
    scenario: "customer",
    vent: "This guy has emailed me 14 times about a $9 discount. I want to tell him to get lost but I can't.",
    options: { channel: "email", intent: "decline", recipient: "out" },
    expectKept: [/\$9\b/],
    forbid: [{ why: "the venting is about the recipient, not for them", re: /\bget lost\b|\b14 times\b/i }],
    note: "The vent describes the recipient. Must not quote the user's frustration back at them.",
  },
  {
    id: "extension-no-new-date",
    scenario: "boss",
    vent: "There's no way this lands Friday. The API docs were wrong and I lost two days to it.",
    options: { channel: "chat", intent: "ask_extension", recipient: "up" },
    // "two-day delay" preserves the fact; the assertion tests the fact, not
    // the phrasing. Models also emit U+2011 here, so allow any hyphen.
    expectKept: [/Friday/, /\btwo.?day|2.?day|two days|2 days/i],
    expectBlanks: ["new_date"],
    forbid: [{ why: "the vent never proposes a replacement date", re: /\bmonday|next week\b/i }],
    note: "Knows the old deadline, not the new one. Must ask, not invent.",
  },

  // ------------------------------------------------------------------- channel
  {
    id: "sms-length",
    scenario: "neighbour",
    vent: "Your car has been blocking my drive since yesterday morning and I've had to park two streets away. This keeps happening and I'm getting really tired of it.",
    options: { channel: "text", intent: "demand_timeline", recipient: "side" },
    expectKept: [/two streets|2 streets/i],
    note: "40-word cap. Length check must bite without dropping the ask.",
  },
  {
    id: "insult-only",
    scenario: "landlord",
    vent: "absolute clown of a landlord. useless. do your job",
    options: { channel: "chat", intent: "chase_reply", recipient: "up" },
    forbid: [{ why: "insults never survive", re: /\b(?:clown|useless|idiot)\b/i }],
    expectBlanks: ["what"],
    note: "Almost entirely insult. Must extract the one real request and blank the rest.",
  },
];

export const byId = (id: string): GoldenCase | undefined =>
  GOLDEN.find((c) => c.id === id);
