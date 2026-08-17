import { GroqAdapter } from "@/model/groq";
import { ModelError } from "@/model/adapter";
import { rewrite } from "@/pipeline";
import type {
  Channel, Firmness, Intent, PriorMessage, Recipient, RewriteOptions,
} from "@/types";

/**
 * The only route that talks to a model. The API key lives here and never
 * reaches the browser.
 *
 * Node runtime rather than edge: the pipeline can make up to four sequential
 * model calls, and Node has the more generous ceiling on Vercel.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_VENT = 4000;
/** Beyond a handful, a thread is a dispute that needs a solicitor, not an app. */
const MAX_THREAD = 6;

const CHANNELS: Channel[] = ["text", "chat", "email"];
const FIRMNESS: Firmness[] = ["soft", "level", "firm"];
const RECIPIENTS: Recipient[] = ["up", "side", "out"];
const INTENTS: Intent[] = [
  "demand_timeline", "chase_reply", "dispute_charge", "ask_extension", "decline",
];

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value)
    ? (value as T)
    : fallback;
}

function bad(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Body must be JSON.");
  }

  const raw = body as { vent?: unknown; options?: Record<string, unknown> };
  const vent = typeof raw.vent === "string" ? raw.vent.trim() : "";

  if (!vent) return bad("Write something first.");
  if (vent.length > MAX_VENT) {
    return bad(`That's ${vent.length} characters; the limit is ${MAX_VENT}.`);
  }

  const o = raw.options ?? {};
  const options: RewriteOptions = {
    channel: pick(o.channel, CHANNELS, "email"),
    firmness: pick(o.firmness, FIRMNESS, "level"),
    recipient: pick(o.recipient, RECIPIENTS, "up"),
    intent: pick(o.intent, INTENTS, "demand_timeline"),
    includeRisks: Array.isArray(o.includeRisks)
      ? o.includeRisks.filter((x): x is string => typeof x === "string")
      : [],
    // Thread history comes from the client's localStorage, so it is untrusted
    // input like anything else: shape-checked, capped, and truncated.
    priorMessages: Array.isArray(o.priorMessages)
      ? o.priorMessages
          .filter(
            (m): m is PriorMessage =>
              !!m &&
              typeof (m as PriorMessage).text === "string" &&
              typeof (m as PriorMessage).sentAt === "string",
          )
          .slice(-MAX_THREAD)
          .map((m) => ({
            sentAt: m.sentAt.slice(0, 40),
            text: m.text.slice(0, MAX_VENT),
            firmness: pick(m.firmness, FIRMNESS, "level"),
          }))
      : [],
  };

  try {
    const result = await rewrite(new GroqAdapter(), vent, options);
    return Response.json(result);
  } catch (err) {
    if (err instanceof ModelError) {
      // Never surface the upstream body — it can echo back the request.
      console.error("[rewrite] model error", err.status, err.message);

      // Misconfiguration is not a secret, and "try again" is useless advice
      // for it. Naming the missing variable is what turns a dead deployment
      // into a two-minute fix.
      if (!process.env.GROQ_API_KEY) {
        return bad(
          "The server has no GROQ_API_KEY. Add it in Vercel under " +
            "Settings → Environment Variables, then redeploy.",
          500,
        );
      }
      if (err.status === 404) {
        return bad(
          `The model "${process.env.GROQ_MODEL ?? "(unset)"}" was not found. ` +
            `Check GROQ_MODEL against console.groq.com/docs/models.`,
          502,
        );
      }
      if (err.status === 401 || err.status === 403) {
        return bad("The API key was rejected. Check GROQ_API_KEY is current.", 502);
      }
      if (err.status === 429) {
        return bad("The model is rate limited right now. Try again in a moment.", 502);
      }
      return bad(
        process.env.NODE_ENV === "production"
          ? "The model call failed. Try again."
          : err.message,
        502,
      );
    }
    console.error("[rewrite] unexpected", err);
    return bad("Something broke on our side.", 500);
  }
}
