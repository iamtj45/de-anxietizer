/**
 * The eval runner. `npm run eval`
 *
 * Runs every golden case through the real pipeline against a real model and
 * scores the message that comes out. This is the thing that settles arguments
 * — including "is Groq good enough for stage 2", which nobody should answer
 * from intuition.
 *
 * Costs real calls. Sequential on purpose: free tiers throttle bursts, and a
 * 429 halfway through makes the numbers meaningless.
 */
import { existsSync } from "node:fs";
import { GroqAdapter } from "../model/groq";
import type { ModelAdapter } from "../model/adapter";
import { rewrite, type RewriteResult } from "../pipeline";
import { GOLDEN, type GoldenCase } from "./golden";
import type { RewriteOptions } from "../types";

if (existsSync(".env")) process.loadEnvFile(".env");

const DEFAULTS: RewriteOptions = {
  channel: "email",
  firmness: "level",
  recipient: "up",
  intent: "demand_timeline",
  includeRisks: [],
};

interface Assertion {
  label: string;
  ok: boolean;
  detail?: string;
}

/**
 * Models emit non-breaking and thin spaces inside dates and amounts, so
 * `March 3` fails a plain /March 3/ and the case looks broken when the
 * output was correct. Flatten them before asserting.
 */
function flattenSpaces(s: string): string {
  return s.replace(/[  -   　]/g, " ");
}

function score(c: GoldenCase, r: RewriteResult): Assertion[] {
  const out: Assertion[] = [];
  const message = flattenSpaces(r.message);

  for (const f of c.forbid ?? []) {
    const hit = f.re.exec(message);
    out.push({
      label: `forbid ${f.re}`,
      ok: !hit,
      detail: hit ? `found "${hit[0]}" — ${f.why}` : undefined,
    });
  }

  for (const re of c.expectKept ?? []) {
    out.push({ label: `keeps ${re}`, ok: re.test(message) });
  }

  if (c.expectBlanks?.length) {
    // Slot *names* are the model's choice; what matters is that it left the
    // fact open instead of inventing one.
    out.push({
      label: `leaves a blank`,
      ok: r.blanks.length > 0,
      detail: `got ${r.blanks.join(" ") || "none"}, expected around ${c.expectBlanks.length}`,
    });
  }

  for (const quote of c.expectHeldBack ?? []) {
    const key = quote.toLowerCase();
    out.push({
      label: `holds back "${quote}"`,
      ok: r.heldBack.some((h) => h.quote.toLowerCase().includes(key)),
      detail: r.heldBack.map((h) => h.quote).join(" | ") || "nothing held back",
    });
  }

  out.push({
    label: "guardrails clean",
    ok: r.failures.length === 0,
    detail: r.failures.map((f) => f.check).join(", ") || undefined,
  });

  return out;
}

function pct(n: number, d: number): string {
  return d === 0 ? "  n/a" : `${String(Math.round((n / d) * 100)).padStart(3)}%`;
}

async function main(): Promise<void> {
  const only = process.argv[2];
  const cases = only ? GOLDEN.filter((c) => c.id.includes(only)) : GOLDEN;
  if (!cases.length) {
    console.error(`No golden case matches "${only}"`);
    process.exit(1);
  }

  let model: ModelAdapter;
  try {
    model = new GroqAdapter();
  } catch (err) {
    console.error(`\n${(err as Error).message}\n`);
    process.exit(1);
  }

  console.log(`\nmodel: ${model.name}   cases: ${cases.length}\n`);

  const checkFired = new Map<string, number>();
  let totalAssertions = 0;
  let passedAssertions = 0;
  let cleanCases = 0;
  let attemptSum = 0;
  let blockedCount = 0;
  const failedCases: { id: string; problems: Assertion[]; message: string }[] = [];

  let first = true;
  for (const c of cases) {
    // Space the cases out. The adapter retries a 429, but pacing avoids
    // tripping the limit in the first place.
    if (!first) await new Promise((r) => setTimeout(r, 2500));
    first = false;

    process.stdout.write(`${c.id.padEnd(26)}`);

    let result: RewriteResult;
    try {
      result = await rewrite(model, c.vent, { ...DEFAULTS, ...c.options });
    } catch (err) {
      console.log(`ERROR  ${(err as Error).message}`);
      continue;
    }

    const assertions = score(c, result);
    const passed = assertions.filter((a) => a.ok).length;

    totalAssertions += assertions.length;
    passedAssertions += passed;
    attemptSum += result.attempts;
    if (result.blocked) blockedCount++;
    for (const f of result.failures) {
      checkFired.set(f.check, (checkFired.get(f.check) ?? 0) + 1);
    }

    const allOk = passed === assertions.length;
    if (allOk) cleanCases++;
    else failedCases.push({ id: c.id, problems: assertions.filter((a) => !a.ok), message: result.message });

    console.log(
      `${allOk ? "ok  " : "FAIL"}  ${String(passed)}/${assertions.length}  ` +
        `${result.attempts} attempt${result.attempts > 1 ? "s" : ""}` +
        `${result.blocked ? "  BLOCKED" : ""}`,
    );
  }

  // ---- detail on failures ------------------------------------------------
  for (const f of failedCases) {
    console.log(`\n── ${f.id} ─────────────────────────────`);
    console.log(f.message);
    for (const p of f.problems) {
      console.log(`   ✗ ${p.label}${p.detail ? ` — ${p.detail}` : ""}`);
    }
  }

  // ---- summary -----------------------------------------------------------
  console.log(`\n${"─".repeat(52)}`);
  console.log(`cases fully passing   ${cleanCases}/${cases.length}   ${pct(cleanCases, cases.length)}`);
  console.log(`assertions passing    ${passedAssertions}/${totalAssertions}   ${pct(passedAssertions, totalAssertions)}`);
  console.log(`average attempts      ${(attemptSum / cases.length).toFixed(2)}`);
  console.log(`blocked               ${blockedCount}`);

  if (checkFired.size) {
    console.log(`\nsurviving failures by check:`);
    for (const [name, n] of [...checkFired].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${name.padEnd(20)} ${String(n).padStart(3)}  ${pct(n, cases.length)}`);
    }
  } else {
    console.log(`\nno surviving guardrail failures`);
  }
  console.log();

  process.exit(cleanCases === cases.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
