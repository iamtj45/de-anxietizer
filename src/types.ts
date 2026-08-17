/**
 * Core contracts for the pipeline.
 *
 *   vent ──▶ extract ──▶ Extraction
 *                          │
 *   Extraction + Options ──▶ generate ──▶ message
 *                          │
 *   message + Extraction ──▶ checks ──▶ CheckFailure[]
 *
 * Nothing here imports a model. The checks are pure functions so they can be
 * tested — and trusted — without an API key.
 */

export type Channel = "text" | "chat" | "email";
export type Firmness = "soft" | "level" | "firm";

/** Power dynamic with the recipient, which sets the register. */
export type Recipient = "up" | "side" | "out";

export type Intent =
  | "demand_timeline"
  | "chase_reply"
  | "dispute_charge"
  | "ask_extension"
  | "decline";

/**
 * Something in the vent that carries consequences. The first four get
 * surfaced to the user for a decision; insults are simply dropped and
 * reported in the receipts.
 */
export type RiskKind =
  | "legal_leverage"
  | "threat"
  | "admission_of_fault"
  | "commitment"
  | "insult";

export interface RiskItem {
  /** Verbatim span from the vent, so the UI can quote it back. */
  quote: string;
  kind: RiskKind;
  /** One sentence on why it needs a decision. Shown in the held-back panel. */
  note: string;
}

/** Stage 1 output. This is the whitelist the message is checked against. */
export interface Extraction {
  entities: {
    dates: string[];
    amounts: string[];
    names: string[];
    places: string[];
    counts: string[];
    /**
     * What the message is *about* — "the migration script", "the roof", "the
     * replacement part". Without this bucket the subject of the message has no
     * home in the whitelist, so `entitySubset` reads it as an invention and the
     * repair loop dutifully strips it out, leaving generic corporate mush.
     */
    things: string[];
  };
  /** Atomic claims the user actually made. */
  claims: string[];
  riskItems: RiskItem[];
  readIntensity: "mild" | "fed_up" | "furious";
}

/**
 * A message already sent in this thread. The escalation ladder rests on these:
 * message three cites message one by date, so the dates and content here are
 * facts the writer genuinely has — and must therefore count as available
 * material, not inventions.
 */
export interface PriorMessage {
  /** ISO date the user marked it sent. */
  sentAt: string;
  text: string;
  firmness: Firmness;
}

export interface RewriteOptions {
  channel: Channel;
  firmness: Firmness;
  recipient: Recipient;
  intent: Intent;
  /** Quotes of risk items the user chose to keep in. Everything else is held back. */
  includeRisks: string[];
  /** Oldest first. Empty for a first message. */
  priorMessages?: PriorMessage[];
}

/** Human-readable date for a prior message, e.g. "3 March". */
export function formatSent(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

export interface CheckContext {
  message: string;
  extraction: Extraction;
  options: RewriteOptions;
}

export interface CheckFailure {
  /** Stable id, e.g. "entity_subset". Used for per-check pass rates. */
  check: string;
  /** Human-readable, for logs and the eval report. */
  reason: string;
  /** Fed verbatim back to the model on the repair pass. */
  repair: string;
}

/** A guardrail. Returns [] on pass. Never throws, never calls a model. */
export type Check = (ctx: CheckContext) => CheckFailure[];

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/** Lowercase, straighten quotes, collapse whitespace. Use before any matching. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Bracketed slots the model may leave for the user, e.g. `[date]`.
 *
 * Spaces and hyphens are allowed because models write `[new date]` and
 * `[order-number]` as readily as `[date]`. Matching only `[a-z_]+` meant those
 * were invisible: the UI showed no blank to fill and the eval reported the
 * model had invented a fact when it had actually asked for one.
 */
export const BLANK_RE = /\[[a-z][a-z_ -]{0,24}\]/gi;

export function stripBlanks(s: string): string {
  return s.replace(BLANK_RE, " ");
}
