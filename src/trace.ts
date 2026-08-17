/**
 * `npm run trace`
 *
 * Walks one request through the pipeline and prints every step, so you can see
 * exactly where the model stops and the code starts.
 *
 * Uses the scripted FakeAdapter, so it is deterministic, offline, and free —
 * the first "model" reply is deliberately bad so the repair loop has to run.
 */
import { check } from "./checks/index";
import { FakeAdapter } from "./model/fake";
import { writeCall } from "./prompts/write";
import { rewrite } from "./pipeline";
import type { Extraction, RewriteOptions } from "./types";

const line = (s = "") => console.log(s);
const rule = (t: string) =>
  line(`\n${"─".repeat(74)}\n${t}\n${"─".repeat(74)}`);

const VENT =
  "Fix my roof or I'm withholding rent, you absolute ghost. " +
  "I've messaged you twice and gotten nothing. Water is coming through.";

/** What model call 1 returns. Hand-written here so the trace is repeatable. */
const EXTRACTION: Extraction = {
  entities: {
    dates: [], amounts: [], names: [], places: [],
    counts: ["twice"], things: ["the roof"],
  },
  claims: ["the roof is leaking", "messaged twice with no reply"],
  riskItems: [
    { quote: "I'm withholding rent", kind: "legal_leverage", note: "Rules vary by state." },
    { quote: "you absolute ghost", kind: "insult", note: "Dropped." },
  ],
  readIntensity: "furious",
};

/** A believable bad first draft: invents a name and a date, adds a promise. */
const ATTEMPT_1 =
  "Hi Dave, sorry to bother you about the roof leak we discussed last Tuesday. " +
  "I'll send photos over shortly. Please let me know.";

/** What it produces once the checks have told it what was wrong. */
const ATTEMPT_2 =
  "The roof has been leaking and water is coming through. I have raised it " +
  "twice with no reply. Please confirm a repair date by [date].";

const OPTIONS: RewriteOptions = {
  channel: "email",
  firmness: "level",
  recipient: "up",
  intent: "demand_timeline",
  includeRisks: [],
};

// ───────────────────────────────────────────────────────────────────────────

rule("STEP 1 — YOUR DRAFT (plain text, straight from the textarea)");
line(VENT);

rule("STEP 2 — EXTRACT   ◀ MODEL CALL 1");
line("The model reads the draft and returns only what is factually in it.");
line("This list becomes the whitelist every later check compares against.\n");
line(JSON.stringify(EXTRACTION, null, 2));

rule("STEP 3 — WRITE, attempt 1   ◀ MODEL CALL 2");
line(ATTEMPT_1);

rule("STEP 4 — CHECK   ◀ NO MODEL. Plain functions, ~1ms.");
const failures = check({ message: ATTEMPT_1, extraction: EXTRACTION, options: OPTIONS });
line(`${failures.length} of 8 guardrails failed:\n`);
for (const f of failures) line(`  ✗ ${f.check.padEnd(20)} ${f.reason}`);

rule("STEP 5 — REPAIR   ◀ the guardrails' output becomes the model's input");
line("Each failure carries a `repair` sentence written as an instruction.");
line("They are appended to the same prompt and model call 2 runs again.");
line("This is the only place the two halves touch.\n");
const retry = writeCall(EXTRACTION, OPTIONS, failures);
const tail = retry.user.slice(retry.user.indexOf("Your previous attempt"));
line(tail);

rule("STEP 3 AGAIN — WRITE, attempt 2   ◀ MODEL CALL 2, retried");
line(ATTEMPT_2);

rule("STEP 4 AGAIN — CHECK");
const second = check({ message: ATTEMPT_2, extraction: EXTRACTION, options: OPTIONS });
line(second.length ? second.map((f) => `  ✗ ${f.check}`).join("\n") : "  ✓ all 8 pass — loop exits");

rule("STEP 6 — PRESENT   ◀ what the interface receives");
const model = new FakeAdapter({ jsons: [EXTRACTION], texts: [ATTEMPT_1, ATTEMPT_2] });
const result = await rewrite(model, VENT, OPTIONS);
line(`message   : ${result.message}`);
line(`attempts  : ${result.attempts}   (model call 2 ran this many times)`);
line(`blanks    : ${result.blanks.join(" ")}      ← you fill these in`);
line(`heldBack  : ${result.heldBack.map((r) => r.quote).join(", ")}   ← your decision`);
line(`blocked   : ${result.blocked}`);
line(`failures  : ${result.failures.length === 0 ? "none" : result.failures.length}`);

rule("THE SHAPE OF IT");
line("  model calls : 2 (extract, write) + 1 per repair");
line("  code only   : all 8 checks, the loop, the blanks, the held-back list");
line("  the model never checks itself, and never sees a guardrail while writing.");
line();
