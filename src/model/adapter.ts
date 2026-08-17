/**
 * The only place the rest of the codebase knows a model exists.
 *
 * Two methods because the pipeline has two shapes of call: stage 1 needs
 * structured JSON, stage 2 needs prose. Keeping them separate means a weaker,
 * cheaper model can serve extraction while a stronger one writes, decided by
 * the eval set rather than by argument.
 */

export interface ModelCall {
  /** Stable across requests — put the cacheable prefix here. */
  system: string;
  /** Varies per request. */
  user: string;
  /** Upper bound on the response. */
  maxTokens?: number;
}

export interface ModelAdapter {
  /** Identifier for eval reports, e.g. "groq:llama-3.3-70b-versatile". */
  readonly name: string;

  /** Free-form text. Used to write the message. */
  text(call: ModelCall): Promise<string>;

  /** Strict JSON. Used to extract facts and risks. Throws if unparseable. */
  json<T>(call: ModelCall): Promise<T>;
}

export class ModelError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
    /** From the provider's `retry-after`, when it sent one. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ModelError";
  }
}

/** Models wrap JSON in prose or fences often enough to be worth handling. */
export function parseJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Last resort: the outermost {...} in the response.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch { /* fall through */ }
    }
    throw new ModelError(`Model did not return valid JSON: ${raw.slice(0, 200)}`);
  }
}
