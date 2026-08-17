import { normalize, type Check, type Intent } from "../types";

/**
 * Pattern *families*, not literal strings.
 *
 * Banning the exact phrase "I hope this email finds you well" leaves
 * "hope this message finds you well", "hope you're doing well", and a dozen
 * more untouched. Blocklists lose that game; match the shape instead.
 */
interface ClichePattern {
  name: string;
  re: RegExp;
  /**
   * Intents where the phrase is legitimate rather than corporate filler.
   * "Per my last email" is passive-aggressive in a relationship, and correct
   * when the point is to build a paper trail.
   */
  okFor?: Intent[];
}

export const CLICHES: ClichePattern[] = [
  { name: "hope this finds you well", re: /\bhope (?:this|you)\b[^.!?]{0,24}\b(?:well|finds you)\b/ },
  { name: "just following up", re: /\bjust (?:following up|checking in|wanted to|reaching out)\b/ },
  { name: "circle back", re: /\bcircl(?:e|ing) back\b/ },
  { name: "touch base", re: /\btouch base\b/ },
  { name: "reach out", re: /\breach(?:ing)? out to you\b/ },
  { name: "per my last", re: /\bper my (?:last|previous)\b/, okFor: ["chase_reply", "demand_timeline"] },
  { name: "as previously mentioned", re: /\bas (?:previously|already) (?:mentioned|stated|discussed)\b/, okFor: ["chase_reply", "demand_timeline"] },
  { name: "synergy", re: /\bsynerg(?:y|ies|istic)\b/ },
  { name: "at your earliest convenience", re: /\bat your earliest convenience\b/ },
  { name: "please advise", re: /\bplease advise\b/ },
  { name: "wanted to flag", re: /\b(?:wanted|wanting) to flag\b/ },
  // Only the sentence-opening filler. "how this will be handled going forward"
  // is ordinary English and flagging it sent the repair loop in circles.
  { name: "moving forward", re: /(?:^|[.!?]\s+)(?:moving|going) forward,/ },
  { name: "low-hanging fruit", re: /\blow[- ]hanging fruit\b/ },
  { name: "let's connect", re: /\blet'?s (?:connect|sync|align)\b/ },
];

export const cliche: Check = ({ message, options }) => {
  const text = normalize(message);

  const hits = CLICHES.filter(
    (p) => !p.okFor?.includes(options.intent) && p.re.test(text),
  );

  if (!hits.length) return [];

  const names = hits.map((h) => `"${h.name}"`).join(", ");
  return [
    {
      check: "cliche",
      reason: `corporate filler: ${names}`,
      repair:
        `Remove this filler: ${names}. ` +
        `Say the thing directly instead — open with the substance, not a pleasantry.`,
    },
  ];
};
