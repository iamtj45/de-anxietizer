import { normalize, type Check, type Intent } from "../types";

/**
 * A calm message that forgets to ask for anything is a diary entry.
 *
 * Each intent has required *elements*. Every element must be satisfied by at
 * least one of its patterns — so "confirm a date by [date]" and "let me know
 * when by Friday" both pass demand_timeline, but "the roof is leaking" alone
 * does not.
 */

interface Element {
  /** Named so the repair instruction can say which half is missing. */
  name: string;
  any: RegExp[];
}

const DATEISH = /\[(?:date|when|deadline)\]|\b(?:by|before|no later than)\s+\S/;

export const INTENT_ELEMENTS: Record<Intent, Element[]> = {
  demand_timeline: [
    {
      name: "an explicit request",
      any: [/\bconfirm\b/, /\bneed\b/, /\blet me know\b/, /\bwhen will\b/, /\bschedul/],
    },
    {
      name: "a deadline or timeline",
      any: [DATEISH, /\btimeline\b/, /\bdeadline\b/, /\brepair date\b/],
    },
  ],
  chase_reply: [
    {
      name: "a reference to the earlier message",
      any: [/\bpreviou/, /\bearlier\b/, /\bagain\b/, /\bstill (?:waiting|no)\b/, /\bmy (?:last|previous)\b/, /\basked\b/, /\braised\b/, /\bmessaged\b/],
    },
    {
      name: "a request for a reply",
      any: [/\breply\b/, /\brespon/, /\bhear back\b/, /\blet me know\b/, /\bconfirm\b/, /\bupdate\b/],
    },
  ],
  dispute_charge: [
    { name: "the amount in question", any: [/\[amount\]/, /\$\s?\d/, /\b\d+(?:[.,]\d+)?\b/, /\bcharge\b/, /\bbilled?\b/, /\binvoice\b/] },
    { name: "what you want done", any: [/\brefund\b/, /\breverse\b/, /\bcorrect\b/, /\bremove\b/, /\bexplain\b/, /\bbreakdown\b/, /\badjust/] },
  ],
  ask_extension: [
    { name: "the new date you want", any: [DATEISH, /\[(?:new_date|newdate)\]/, /\bextension\b/, /\bmore time\b/] },
    { name: "the ask itself", any: [/\bextension\b/, /\bmore time\b/, /\bpush\b/, /\bmove\b/, /\bextend\b/, /\bcould i\b/, /\brequest/] },
  ],
  decline: [
    {
      name: "an unambiguous no",
      any: [/\bcan'?t\b/, /\bcannot\b/, /\bunable\b/, /\bwon'?t be able\b/, /\bdeclin/, /\bhave to pass\b/, /\bnot able\b/, /\bno[.,]/],
    },
  ],
};

export const ctaPresent: Check = ({ message, options }) => {
  const text = normalize(message);
  const missing = INTENT_ELEMENTS[options.intent]
    .filter((el) => !el.any.some((re) => re.test(text)))
    .map((el) => el.name);

  if (!missing.length) return [];

  return [
    {
      check: "cta_present",
      reason: `intent "${options.intent}" is missing ${missing.join(" and ")}`,
      repair:
        `The message does not actually ask for what the user needs. ` +
        `It is missing ${missing.join(" and ")}. ` +
        `Add it in one short sentence. If you do not have the detail, use a ` +
        `bracketed blank such as [date] rather than omitting the ask.`,
    },
  ];
};
