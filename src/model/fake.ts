import type { ModelAdapter, ModelCall } from "./adapter";

/**
 * A scripted adapter, so the pipeline and the repair loop can be tested
 * without a key, a network, or a bill. Scripts are consumed in order.
 */
export class FakeAdapter implements ModelAdapter {
  readonly name = "fake";
  readonly calls: { kind: "text" | "json"; call: ModelCall }[] = [];

  private textQueue: string[];
  private jsonQueue: unknown[];

  constructor(opts: { texts?: string[]; jsons?: unknown[] } = {}) {
    this.textQueue = [...(opts.texts ?? [])];
    this.jsonQueue = [...(opts.jsons ?? [])];
  }

  async text(call: ModelCall): Promise<string> {
    this.calls.push({ kind: "text", call });
    const next = this.textQueue.shift();
    if (next === undefined) throw new Error("FakeAdapter: text queue exhausted");
    return next;
  }

  async json<T>(call: ModelCall): Promise<T> {
    this.calls.push({ kind: "json", call });
    const next = this.jsonQueue.shift();
    if (next === undefined) throw new Error("FakeAdapter: json queue exhausted");
    return next as T;
  }

  /** Prompts actually sent, for asserting that repair feedback got through. */
  get lastUserPrompt(): string {
    return this.calls.at(-1)?.call.user ?? "";
  }
}
