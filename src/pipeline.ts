import { check, hasBlocking, repairInstruction } from "./checks/index";
import type { ModelAdapter } from "./model/adapter";
import { extractCall } from "./prompts/extract";
import { writeCall } from "./prompts/write";
import { BLANK_RE } from "./types";
import type {
  CheckFailure, Extraction, RewriteOptions, RiskItem,
} from "./types";

export const MAX_ATTEMPTS = 3;

export interface RewriteResult {
  message: string;
  extraction: Extraction;
  /** Failures that survived every repair attempt. Empty means clean. */
  failures: CheckFailure[];
  /** 1 means it was right first time. */
  attempts: number;
  /** True when a decision the user made could not be honoured. Do not send. */
  blocked: boolean;
  /** Risk items the user has not opted into — the held-back panel. */
  heldBack: RiskItem[];
  /** Bracketed slots the user still needs to fill. */
  blanks: string[];
}

/** Shape guard: a model can return valid JSON that is still the wrong JSON. */
function normalizeExtraction(raw: unknown): Extraction {
  const r = (raw ?? {}) as Partial<Extraction> & { entities?: Partial<Extraction["entities"]> };
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  return {
    entities: {
      dates: arr(r.entities?.dates),
      amounts: arr(r.entities?.amounts),
      names: arr(r.entities?.names),
      places: arr(r.entities?.places),
      counts: arr(r.entities?.counts),
      things: arr(r.entities?.things),
    },
    claims: arr(r.claims),
    riskItems: Array.isArray(r.riskItems)
      ? r.riskItems
          .filter((x): x is RiskItem => !!x && typeof (x as RiskItem).quote === "string")
          .map((x) => ({
            quote: x.quote,
            kind: x.kind ?? "commitment",
            note: x.note ?? "",
          }))
      : [],
    readIntensity: (["mild", "fed_up", "furious"] as const).includes(
      r.readIntensity as never,
    )
      ? (r.readIntensity as Extraction["readIntensity"])
      : "fed_up",
  };
}

export function findBlanks(message: string): string[] {
  return [...new Set(message.match(BLANK_RE) ?? [])];
}

/** Models like to wrap the message in quotes or a "Here is..." preamble. */
export function tidy(message: string): string {
  let m = message.trim();
  m = m.replace(/^(?:here(?:'s| is)[^\n:]*:|subject:[^\n]*)\s*/i, "").trim();
  if (/^["“](.|\n)*["”]$/.test(m)) m = m.slice(1, -1).trim();
  return m;
}

export async function rewrite(
  model: ModelAdapter,
  vent: string,
  options: RewriteOptions,
): Promise<RewriteResult> {
  // ---- Stage 1: extract -------------------------------------------------
  const extraction = normalizeExtraction(await model.json(extractCall(vent)));

  // ---- Stages 2 & 3: write, check, repair -------------------------------
  let message = "";
  let failures: CheckFailure[] = [];
  let attempts = 0;

  // Counted inside the loop: a `for (a = 1; a <= MAX; a++)` header reports
  // MAX + 1 once the last attempt fails, which would quietly overstate the
  // repair rate in the eval report.
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    attempts = i + 1;
    message = tidy(await model.text(writeCall(extraction, options, failures)));
    failures = check({ message, extraction, options });
    if (!failures.length) break;
  }

  // ---- Stage 4: present -------------------------------------------------
  return {
    message,
    extraction,
    failures,
    attempts,
    blocked: hasBlocking(failures),
    heldBack: extraction.riskItems.filter(
      (r) => r.kind !== "insult" && !options.includeRisks.includes(r.quote),
    ),
    blanks: findBlanks(message),
  };
}

export { repairInstruction };
