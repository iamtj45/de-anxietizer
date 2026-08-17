import type { ModelCall } from "../model/adapter";
import { WORD_CAP } from "../checks/length";
import { formatSent } from "../types";
import type {
  CheckFailure, Extraction, Firmness, Intent, PriorMessage, Recipient, RewriteOptions,
} from "../types";

/**
 * Stage 2. The system half is byte-stable across every request in the app —
 * that is what makes it cacheable, and why nothing situational lives here.
 *
 * Written as positive statements. Instructions shouted in capitals were how
 * you got older models to comply; current ones follow the prompt closely
 * enough that emphasis mostly causes overcorrection.
 */
export const WRITE_SYSTEM = `
You rewrite a person's raw, angry draft into a message they can actually send.

They are not in trouble and you are not managing them. They came here because
they have been putting off a message that matters, and they want to stop
sounding furious without stopping being taken seriously.

FACTS
Use only the facts you are given. When the message needs a detail the person did
not supply — a date, a name, a room, an amount — leave a bracketed blank for
them to fill: [date], [name], [where], [amount], [what]. A blank is always
correct. An invented detail never is, however plausible it looks.

POSITION
Politeness and concession are different things.
- Do not apologise for something that is not the person's fault.
- Do not thank the recipient for doing what they are already obliged to do.
- Keep deadlines firm. "by Friday" is a deadline. "by Friday, whenever suits
  you" is not.
- Do not commit the person to anything they did not offer.
- Name the problem, never the person.

VOICE
Direct, specific, unhurried — the way a composed adult writes. Open with the
substance rather than a pleasantry. Plain words over corporate ones.

OUTPUT
Return only the message text. No subject line, no preamble, no explanation, and
no quotation marks around it.
`.trim();

const REGISTER: Record<Recipient, string> = {
  up: "Writing to someone with power over the outcome — a manager, landlord, or client. Clear and unhurried. Deference is not required, and concession is not deference.",
  side: "Writing to a peer. Collaborative and direct, no ceremony.",
  out: "Writing to a vendor, contractor, or customer. Courteous and boundaried, not accommodating.",
};

const TONE: Record<Firmness, string> = {
  soft: "Warm. Give room without giving ground.",
  level: "Neutral and matter-of-fact.",
  firm: "Direct and unmistakable. State any consequence the person chose to include plainly, as a position rather than a threat.",
};

const ASK: Record<Intent, string> = {
  demand_timeline: "Ask for a specific repair or completion date, and name a deadline for the reply.",
  chase_reply: "Reference that this was raised before, and ask for a response by a specific point.",
  dispute_charge: "Name the amount in question and say exactly what you want done about it.",
  ask_extension: "Ask for the extension and name the new date being requested.",
  decline: "Decline unambiguously. No maybe, no door left open unless the person left one.",
};

function facts(e: Extraction): string {
  const rows = [
    ["Subject", e.entities.things],
    ["Dates", e.entities.dates],
    ["Amounts", e.entities.amounts],
    ["Names", e.entities.names],
    ["Places", e.entities.places],
    ["Counts", e.entities.counts],
  ] as const;

  const listed = rows
    .filter(([, v]) => v.length)
    .map(([k, v]) => `${k}: ${v.map((x) => `"${x}"`).join(", ")}`);

  const claims = e.claims.length
    ? `What they said happened:\n${e.claims.map((c) => `- ${c}`).join("\n")}`
    : "What they said happened: nothing specific.";

  return [
    listed.length
      ? `Facts available (use these exactly as written):\n${listed.join("\n")}`
      : "Facts available: none. Every specific must be a bracketed blank.",
    claims,
  ].join("\n\n");
}

function risks(e: Extraction, include: string[]): string {
  const live = e.riskItems.filter((r) => r.kind !== "insult");
  if (!live.length) return "";

  const chosen = live.filter((r) => include.includes(r.quote));
  const held = live.filter((r) => !include.includes(r.quote));

  const parts: string[] = [];
  if (chosen.length) {
    parts.push(
      `Include these, phrased as a position rather than an outburst:\n` +
        chosen.map((r) => `- "${r.quote}"`).join("\n"),
    );
  }
  if (held.length) {
    parts.push(
      `Leave these out entirely — no hint, no paraphrase. The person will decide ` +
        `about them separately:\n` +
        held.map((r) => `- "${r.quote}"`).join("\n") +
        `\n\nDo not substitute a vaguer consequence in their place. No "further ` +
        `action", no "I will be forced to", no "or else". When something is held ` +
        `back, the message ends at the request — a softened threat is still the ` +
        `threat the person asked you to leave out.`,
    );
  }
  return parts.join("\n\n");
}

/**
 * The escalation ladder. A follow-up is not a louder first message — its whole
 * force comes from the record: that this was already asked, on a date, and
 * nothing happened.
 */
function thread(prior: PriorMessage[]): string {
  if (!prior.length) return "";

  const history = prior
    .map((p, i) => `Message ${i + 1}, sent ${formatSent(p.sentAt)}:\n${p.text}`)
    .join("\n\n");

  return [
    `This is message ${prior.length + 1} in an ongoing thread. Earlier messages, oldest first:`,
    history,
    `Reference the record explicitly — how long this has been open and how many ` +
      `times it has been raised. Those dates are established fact, not guesses, ` +
      `so state them rather than leaving blanks. Do not repeat the earlier ` +
      `wording; a follow-up that restates the first message reads as noise.`,
  ].join("\n\n");
}

export function writeCall(
  extraction: Extraction,
  options: RewriteOptions,
  failures: CheckFailure[] = [],
): ModelCall {
  const cap = WORD_CAP[options.channel];

  const sections = [
    REGISTER[options.recipient],
    TONE[options.firmness],
    `${ASK[options.intent]}`,
    `Hard limit: ${cap} words.`,
    thread(options.priorMessages ?? []),
    facts(extraction),
    risks(extraction, options.includeRisks),
  ].filter(Boolean);

  if (failures.length) {
    sections.push(
      `Your previous attempt failed these checks. Fix every one:\n` +
        failures.map((f, i) => `${i + 1}. ${f.repair}`).join("\n"),
    );
  }

  return {
    system: WRITE_SYSTEM,
    user: sections.join("\n\n---\n\n"),
    maxTokens: 600,
  };
}
