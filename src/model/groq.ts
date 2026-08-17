import { ModelError, parseJson, type ModelAdapter, type ModelCall } from "./adapter";

/**
 * Groq speaks the OpenAI chat-completions shape, so this is a thin fetch
 * wrapper — no SDK needed, and nothing to swap out if we move providers.
 *
 * ⚠ Verify GROQ_MODEL against https://console.groq.com/docs/models before
 * trusting the default below. Groq's catalogue changes; a retired id fails
 * with a 404 that reads like an auth problem.
 */

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

interface ChatChoice {
  message?: { content?: string; reasoning?: string };
  finish_reason?: string;
}
interface ChatResponse {
  choices?: ChatChoice[];
  error?: { message?: string };
}

/**
 * Reasoning models (gpt-oss, qwen3) spend part of max_tokens thinking before
 * they write anything. Budget too tightly and `content` comes back empty with
 * finish_reason "length" — a silent truncation that looks like an API fault.
 */
const REASONING = /gpt-oss|qwen3|deepseek-r1/i;

export interface GroqOptions {
  apiKey?: string;
  model?: string;
  /** Per-request ceiling. Groq is fast; failures are usually not timeouts. */
  timeoutMs?: number;
  /** 429 retries. The free tier throttles hard on bursts. */
  maxRetries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GroqAdapter implements ModelAdapter {
  readonly name: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(opts: GroqOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new ModelError(
        "GROQ_API_KEY is not set. Copy .env.example to .env and add your key.",
      );
    }
    this.apiKey = apiKey;
    this.model = opts.model ?? process.env.GROQ_MODEL ?? DEFAULT_MODEL;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxRetries = opts.maxRetries ?? 4;
    this.name = `groq:${this.model}`;
  }

  async text(call: ModelCall): Promise<string> {
    return this.withRetry(() => this.complete(call, false));
  }

  async json<T>(call: ModelCall): Promise<T> {
    return parseJson<T>(await this.withRetry(() => this.complete(call, true)));
  }

  /**
   * Retries only on 429 and 5xx. A 400 means the request is wrong and will be
   * wrong again; retrying it just burns quota and hides the real error.
   *
   * Honours Groq's `retry-after` when present — the free tier sends it, and
   * guessing a shorter delay is how you get throttled harder.
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let last: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        last = err;
        const status = err instanceof ModelError ? err.status : undefined;
        // A ModelError with no status never reached the network: either a
        // config problem or a dropped connection. The first is not worth
        // retrying, the second is — and "request failed" is how the latter
        // surfaces, so retry that and let config errors fail on the message.
        const transport =
          err instanceof ModelError &&
          status === undefined &&
          /request failed|timed out/i.test(err.message);
        const retryable =
          status === 429 || (status !== undefined && status >= 500) || transport;
        if (!retryable || attempt === this.maxRetries) break;

        const after = err instanceof ModelError ? err.retryAfterMs : undefined;
        await sleep(after ?? Math.min(1000 * 2 ** attempt, 20_000));
      }
    }
    throw last;
  }

  private async complete(call: ModelCall, asJson: boolean): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const reasoning = REASONING.test(this.model);
    // Reasoning burns budget before the first visible token, so give it room.
    const maxTokens = (call.maxTokens ?? 1024) + (reasoning ? 2500 : 0);

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: call.system },
            { role: "user", content: call.user },
          ],
          max_tokens: maxTokens,
          // Low but not zero: we want stable output, and the guardrails —
          // not the sampler — are what enforce correctness.
          temperature: asJson ? 0 : 0.3,
          ...(reasoning ? { reasoning_effort: "low" } : {}),
          ...(asJson ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      const body = await res.text();
      if (!res.ok) {
        const header = res.headers.get("retry-after");
        const seconds = header ? Number(header) : NaN;
        throw new ModelError(
          `Groq returned ${res.status}`,
          res.status,
          body,
          Number.isFinite(seconds) ? Math.ceil(seconds * 1000) + 250 : undefined,
        );
      }

      const parsed = JSON.parse(body) as ChatResponse;
      const choice = parsed.choices?.[0];
      const content = choice?.message?.content;

      if (!content) {
        if (choice?.finish_reason === "length") {
          throw new ModelError(
            `${this.model} used its whole budget (${maxTokens} tokens) before ` +
              `writing an answer. Raise maxTokens, or use a non-reasoning model.`,
            res.status,
            body,
          );
        }
        throw new ModelError(
          parsed.error?.message ?? "Groq returned no content",
          res.status,
          body,
        );
      }
      return content;
    } catch (err) {
      if (err instanceof ModelError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new ModelError(`Groq timed out after ${this.timeoutMs}ms`);
      }
      throw new ModelError(`Groq request failed: ${String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
