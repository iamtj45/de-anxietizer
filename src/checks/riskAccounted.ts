import { normalize, type Check, type RiskItem } from "../types";

/**
 * Nothing with teeth gets decided silently.
 *
 * Three rules, one per direction things can go wrong:
 *
 *   included   → the message must actually express it. Being told to keep the
 *                leverage and then dropping it anyway is the original sin this
 *                product exists to prevent.
 *   excluded   → the message must NOT express it. The user said hold it back.
 *   insult     → never appears, regardless of what anyone asked for.
 *
 * This is the only check that can *block* rather than repair: if the pipeline
 * cannot honour an explicit include/exclude decision, showing the message
 * anyway would be lying to the user about what they are about to send.
 */

const STOPWORDS = new Set([
  "i", "im", "i'm", "ive", "i've", "ill", "i'll", "you", "your", "youre",
  "the", "a", "an", "and", "or", "but", "if", "is", "are", "was", "am", "be",
  "to", "of", "in", "on", "at", "for", "with", "my", "me", "it", "this",
  "that", "so", "not", "no", "will", "would", "can", "just", "about", "until",
]);

/** Distinctive words from a quote — what we look for in the message. */
export function keywords(quote: string): string[] {
  return [
    ...new Set(
      normalize(quote)
        .replace(/[^\p{L}\p{N}\s']/gu, " ")
        .split(/\s+/)
        .map((w) => w.replace(/'/g, ""))
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
        .map((w) => w.replace(/(?:ing|ed|s)$/, "")),
    ),
  ].filter(Boolean);
}

/**
 * Needs two keywords when the quote has two, so a landlord message mentioning
 * "rent" in passing is not read as the withholding threat leaking through.
 */
function expressed(message: string, risk: RiskItem): boolean {
  const text = normalize(message);
  const keys = keywords(risk.quote);
  if (!keys.length) return false;
  const hits = keys.filter((k) => text.includes(k)).length;
  return keys.length >= 2 ? hits >= 2 : hits >= 1;
}

export const riskAccounted: Check = ({ message, extraction, options }) => {
  const failures = [];

  for (const risk of extraction.riskItems) {
    const shown = expressed(message, risk);

    if (risk.kind === "insult") {
      if (shown) {
        failures.push({
          check: "risk_accounted",
          reason: `insult leaked through: "${risk.quote}"`,
          repair:
            `Remove the insult "${risk.quote}" and anything paraphrasing it. ` +
            `Name the problem, never the person.`,
        });
      }
      continue;
    }

    const wanted = options.includeRisks.includes(risk.quote);

    if (wanted && !shown) {
      failures.push({
        check: "risk_accounted",
        reason: `dropped an included item: "${risk.quote}"`,
        repair:
          `The user explicitly chose to keep "${risk.quote}" in this message ` +
          `and you left it out. State it plainly as a consequence or position ` +
          `— do not soften it into a hint.`,
      });
    }

    if (!wanted && shown) {
      failures.push({
        check: "risk_accounted",
        reason: `leaked a held-back item: "${risk.quote}"`,
        repair:
          `The user chose to hold "${risk.quote}" back from this message. ` +
          `Remove it entirely, including any hint or paraphrase of it.`,
      });
    }
  }

  return failures;
};
