import type { ModelCall } from "../model/adapter";

/**
 * Stage 1. Turns the raw vent into the whitelist everything downstream is
 * checked against, plus the list of things that need the user's decision.
 *
 * The instruction that matters most is "verbatim". If this stage paraphrases
 * "since the 3rd" into "early this month", entitySubset will later reject a
 * correct message because the fact no longer matches the whitelist.
 */
export const EXTRACT_SYSTEM = `
You read an angry, unfiltered draft and pull out what is factually in it.

Return JSON matching this shape exactly:

{
  "entities": {
    "dates":   [],  // any time reference: "March 3", "last Tuesday", "nine days"
    "amounts": [],  // money, quantities: "$1,847", "three boxes"
    "names":   [],  // people, companies, products named
    "places":  [],  // rooms, addresses, locations
    "counts":  [],  // how many times something happened: "twice", "four times"
    "things":  []   // what it is ABOUT: "the migration script", "the roof",
                    // "the replacement part", "the refund". Be generous here —
                    // if the writer named the subject, capture it.
  },
  "claims":  [],    // short factual statements the writer made
  "riskItems": [{
    "quote": "",    // VERBATIM span from the draft
    "kind":  "",    // legal_leverage | threat | admission_of_fault | commitment | insult
    "note":  ""     // one sentence: why this needs the writer's decision
  }],
  "readIntensity": ""  // mild | fed_up | furious
}

Rules:

Copy entities and quotes VERBATIM from the draft. Do not normalise dates, round
numbers, correct spelling, or tidy phrasing. Downstream checks match these
strings literally, so a paraphrase breaks them.

Record only what is present. If the draft names no date, "dates" is empty. Never
infer, complete, or guess a detail the writer did not write.

A risk item is something that costs the WRITER if it goes out carelessly. The
complaint itself is never a risk item. "Siobhán keeps reassigning my tickets",
"the roof is leaking", "you charged me twice" — those are claims. They are the
whole point of the message and must be stated plainly.

Ask: if this sentence were sent as written, could it expose the writer to legal
trouble, cost them leverage, concede fault, or make them look abusive? Only then
is it a risk item. When unsure, leave it out — a claim wrongly marked as a risk
gets stripped from the message, which silently deletes what the writer needed
to say.

Classify risk items by what they cost the writer if sent carelessly:
- legal_leverage: a lawful remedy they are invoking (withholding rent, chargeback,
  cancelling, escalating to a regulator)
- threat: legal or personal consequences they are raising (lawyer, court, reviews)
- admission_of_fault: something they concede is their own doing
- commitment: something they promise to do
- insult: abuse aimed at the recipient

An insult is still a risk item — recorded so it can be shown as removed, never
so it can be used.

Return only the JSON object.
`.trim();

export function extractCall(vent: string): ModelCall {
  return {
    system: EXTRACT_SYSTEM,
    user: `Draft:\n\n${vent}`,
    maxTokens: 1200,
  };
}
