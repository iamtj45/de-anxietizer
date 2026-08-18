"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WORD_CAP } from "@/checks/length";
import {
  BLANK_EXACT_RE, BLANK_RE, BLANK_SPLIT_RE,
  blankKey, countWords, formatSent, hasBlank, MAX_THREAD,
} from "@/types";
import type { RewriteResult } from "@/pipeline";
import type {
  Channel, Firmness, Intent, PriorMessage, Recipient, RewriteOptions,
} from "@/types";

/** Threads live only in the browser — no account, no server state. */
const THREAD_KEY = "deanx.thread";

function loadThread(): PriorMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(THREAD_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (m): m is PriorMessage =>
            !!m && typeof m.text === "string" && typeof m.sentAt === "string",
        )
      : [];
  } catch {
    return [];
  }
}

const INTENT_LABELS: [Intent, string][] = [
  ["demand_timeline", "Get a date or timeline"],
  ["chase_reply", "Chase a reply"],
  ["dispute_charge", "Dispute a charge"],
  ["ask_extension", "Ask for more time"],
  ["decline", "Say no without burning it"],
];

const INTENSITY: Record<string, string> = {
  mild: "Mildly annoyed",
  fed_up: "Fed up",
  furious: "Furious",
};


// ---------------------------------------------------------------------------

function Segmented<T extends string>({
  value, options, onChange, disabled,
}: {
  value: T;
  options: { v: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          disabled={disabled}
          onClick={() => onChange(o.v)}
        >
          {o.label}
          {o.hint ? <small>{o.hint}</small> : null}
        </button>
      ))}
    </div>
  );
}

/** Renders the message, turning [slots] into inline editable fields. */
function Message({
  text, fills, onFill,
}: {
  text: string;
  fills: Record<string, string>;
  onFill: (key: string, value: string) => void;
}) {
  /**
   * Which blank is open, by position — not by slot name.
   *
   * A message often carries the same slot twice ("confirm by [date]… reply by
   * [date]"). Keying this by name opened every matching blank at once and left
   * keystrokes going to whichever input won focus. Position identifies one
   * blank; `fills` stays keyed by name, so filling either still updates both.
   */
  const [editing, setEditing] = useState<number | null>(null);
  const parts = text.split(BLANK_SPLIT_RE);

  return (
    <p className="message">
      {parts.map((part, i) => {
        if (!BLANK_EXACT_RE.test(part)) return <span key={i}>{part}</span>;

        const key = blankKey(part);
        const filled = fills[key];

        if (editing === i) {
          return (
            <input
              key={i}
              className="blankinput"
              autoFocus
              defaultValue={filled ?? ""}
              placeholder={key}
              onBlur={(e) => { onFill(key, e.target.value.trim()); setEditing(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                if (e.key === "Escape") { setEditing(null); }
              }}
            />
          );
        }

        return (
          <button
            key={i}
            type="button"
            className={filled ? "blank done" : "blank"}
            title={filled ? "Click to change" : "Click to fill in"}
            onClick={() => setEditing(i)}
          >
            {filled || part}
          </button>
        );
      })}
    </p>
  );
}

// ---------------------------------------------------------------------------

export function Composer() {
  const [vent, setVent] = useState("");
  const [options, setOptions] = useState<RewriteOptions>({
    channel: "email",
    firmness: "level",
    recipient: "up",
    intent: "demand_timeline",
    includeRisks: [],
  });

  const [result, setResult] = useState<RewriteResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fills, setFills] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [thread, setThread] = useState<PriorMessage[]>([]);

  const ventRef = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef(0);

  // Read after mount, never during render — the server has no localStorage,
  // and reading it during render would mismatch the hydrated markup.
  useEffect(() => setThread(loadThread()), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1900);
    return () => clearTimeout(t);
  }, [toast]);

  const saveThread = useCallback((next: PriorMessage[]) => {
    setThread(next);
    try {
      window.localStorage.setItem(THREAD_KEY, JSON.stringify(next));
    } catch { /* private mode, quota — the app still works, just forgets */ }
  }, []);

  /** Single path to the API. Later requests always win over earlier ones. */
  const run = useCallback(
    async (patch: Partial<RewriteOptions> = {}) => {
      const next = { ...options, ...patch, priorMessages: thread };
      setOptions(next);
      if (!vent.trim()) { setError("Write something first."); return; }

      const id = ++requestId.current;
      setBusy(true);
      setError(null);

      try {
        const res = await fetch("/api/rewrite", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ vent, options: next }),
        });
        const data = await res.json();
        if (id !== requestId.current) return; // superseded
        if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
        setResult(data as RewriteResult);
      } catch {
        if (id === requestId.current) setError("Couldn't reach the server.");
      } finally {
        if (id === requestId.current) setBusy(false);
      }
    },
    [options, vent, thread],
  );

  const plain = useCallback(() => {
    if (!result) return "";
    return result.message.replace(BLANK_RE, (m) => fills[blankKey(m)] || m);
  }, [result, fills]);

  const copy = useCallback(async () => {
    const out = plain();
    try { await navigator.clipboard.writeText(out); } catch { /* clipboard blocked */ }
    return hasBlank(out);
  }, [plain]);

  /** Copy, remember it as sent, and clear the desk for the follow-up. */
  const sentIt = useCallback(async () => {
    const gaps = await copy();
    const text = plain();

    saveThread(
      [...thread, { sentAt: new Date().toISOString(), text, firmness: options.firmness }]
        .slice(-MAX_THREAD),
    );

    setResult(null);
    setFills({});
    setOptions((o) => ({ ...o, includeRisks: [] }));
    setVent("");
    ventRef.current?.focus();
    setToast(gaps ? "Copied with blanks — saved to the thread" : "Copied and saved to the thread");
  }, [copy, plain, saveThread, thread, options.firmness]);

  const startFresh = useCallback(() => {
    saveThread([]);
    setResult(null);
    setFills({});
    setVent("");
    setOptions((o) => ({ ...o, includeRisks: [] }));
    ventRef.current?.focus();
  }, [saveThread]);

  const shiftFirmness = (dir: -1 | 1) => {
    const order: Firmness[] = ["soft", "level", "firm"];
    const i = order.indexOf(options.firmness);
    const next = order[Math.min(order.length - 1, Math.max(0, i + dir))]!;
    if (next !== options.firmness) void run({ firmness: next });
  };

  const toggleRisk = (quote: string, include: boolean) => {
    const includeRisks = include
      ? [...options.includeRisks, quote]
      : options.includeRisks.filter((q) => q !== quote);
    void run({ includeRisks });
  };

  const words = result ? countWords(result.message) : 0;
  const cap = WORD_CAP[options.channel];
  const cut = result?.extraction.riskItems.filter((r) => r.kind === "insult") ?? [];
  const kept = result ? Object.values(result.extraction.entities).flat() : [];

  return (
    <>
      <div className="cols">
        {/* ---------------- compose ---------------- */}
        <div className="panel hot">
          <div className="phead">
            <span className="lbl">Say it however it&apos;s in your head</span>
          </div>
          <div className="pbody">
            {thread.length ? (
              <div className="thread">
                <div className="thread-top">
                  <span className="lbl">
                    Follow-up #{thread.length + 1} — it knows what you already sent
                  </span>
                  <button className="mini ghost" type="button" onClick={startFresh}>
                    Start fresh
                  </button>
                </div>
                <ol className="thread-list">
                  {thread.map((m, i) => (
                    <li key={m.sentAt + i}>
                      <span className="thread-when">{formatSent(m.sentAt)}</span>
                      <span className="thread-text">{m.text}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            <textarea
              ref={ventRef}
              value={vent}
              onChange={(e) => setVent(e.target.value)}
              placeholder={
                thread.length
                  ? "What's happened since? Or just say nothing's happened."
                  : "Type the version you'd never send."
              }
            />

            <div className="readrow">
              {result ? (
                <>
                  <span className="lbl">Read as</span>
                  <span className="readchip">
                    {INTENSITY[result.extraction.readIntensity] ?? result.extraction.readIntensity}
                  </span>
                </>
              ) : null}
              <span className="vcount">
                {vent.trim() ? `${countWords(vent)} words in` : ""}
              </span>
            </div>

            <div className="well">
              <div className="field">
                <span className="lbl">Who it&apos;s going to</span>
                <Segmented<Recipient>
                  value={options.recipient}
                  disabled={busy}
                  onChange={(v) => void run({ recipient: v })}
                  options={[
                    { v: "up", label: "Upward", hint: "boss, landlord" },
                    { v: "side", label: "Sideways", hint: "coworker, peer" },
                    { v: "out", label: "Outward", hint: "vendor, client" },
                  ]}
                />
              </div>

              <div className="field">
                <span className="lbl">Where you&apos;re sending it</span>
                <Segmented<Channel>
                  value={options.channel}
                  disabled={busy}
                  onChange={(v) => void run({ channel: v })}
                  options={[
                    { v: "text", label: "Text", hint: "40 words" },
                    { v: "chat", label: "Chat", hint: "60 words" },
                    { v: "email", label: "Email", hint: "100 words" },
                  ]}
                />
              </div>

              <div className="field">
                <label className="lbl" htmlFor="intent">What you need out of it</label>
                <select
                  id="intent"
                  value={options.intent}
                  disabled={busy}
                  onChange={(e) => void run({ intent: e.target.value as Intent })}
                >
                  {INTENT_LABELS.map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <span className="lbl">How firm</span>
                <Segmented<Firmness>
                  value={options.firmness}
                  disabled={busy}
                  onChange={(v) => void run({ firmness: v })}
                  options={[
                    { v: "soft", label: "Soft" },
                    { v: "level", label: "Level" },
                    { v: "firm", label: "Firm" },
                  ]}
                />
              </div>
            </div>

            <button
              className={busy ? "go busy" : "go"}
              type="button"
              disabled={busy}
              onClick={() => void run()}
            >
              {busy ? "Cooling it down…" : "Rewrite it"}
              <span className="bar" />
            </button>

            {error ? <div className="error">{error}</div> : null}
          </div>
        </div>

        {/* ---------------- result ---------------- */}
        <div className="panel calm">
          <div className="phead">
            <span className="lbl">Ready to send</span>
            {result ? (
              <span className={words > cap ? "count over" : "count"}>
                <b>{words}</b>&thinsp;/&thinsp;{cap} words
              </span>
            ) : null}
          </div>

          {!result ? (
            <div className="empty">
              <span className="mark" />
              <p>
                Your message lands here — with blanks where it refused to guess a
                fact, and anything risky held back for your call.
              </p>
            </div>
          ) : (
            <div className="pbody">
              <div className={busy ? "sheet stale" : "sheet"}>
                <Message
                  text={result.message}
                  fills={fills}
                  onFill={(k, v) =>
                    setFills((f) => {
                      const next = { ...f };
                      if (v) next[k] = v; else delete next[k];
                      return next;
                    })
                  }
                />
              </div>

              <div className="acts">
                <div className="actrow">
                  <span className="tonepair">
                    <button className="mini" type="button" disabled={busy} onClick={() => shiftFirmness(-1)}>
                      Softer
                    </button>
                    <button className="mini" type="button" disabled={busy} onClick={() => shiftFirmness(1)}>
                      Firmer
                    </button>
                  </span>
                  <span className="spacer" />
                  <button className="mini ghost" type="button" disabled={busy} onClick={() => void run()}>
                    Rewrite from scratch
                  </button>
                </div>
                <div className="actrow finish">
                  <button
                    className="mini"
                    type="button"
                    disabled={busy}
                    onClick={async () => setToast((await copy()) ? "Copied — blanks still in it" : "Copied")}
                  >
                    Copy
                  </button>
                  <span className="spacer" />
                  <button className="mini primary" type="button" disabled={busy} onClick={() => void sentIt()}>
                    Sent it — write the next one
                  </button>
                </div>
              </div>

              {result.failures.length ? (
                <div className="warn">
                  <span className="lbl">
                    {result.blocked ? "Do not send yet" : "Checks that did not clear"}
                  </span>
                  <ul>
                    {result.failures.map((f, i) => (
                      <li key={i}>{f.reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.heldBack.map((r) => (
                <div className="held" key={r.quote}>
                  <div className="held-top">
                    <span className="chip">Held back</span>
                    <span className="held-q">You mentioned &ldquo;{r.quote}&rdquo;.</span>
                  </div>
                  <p className="held-why">{r.note}</p>
                  <div className="held-btns">
                    <button className="mini" type="button" aria-pressed={false} disabled={busy} onClick={() => toggleRisk(r.quote, true)}>
                      Put it in
                    </button>
                    <button className="mini on" type="button" aria-pressed={true} disabled={busy}>
                      Keep it out
                    </button>
                  </div>
                </div>
              ))}

              {options.includeRisks.map((quote) => (
                <div className="held" key={quote}>
                  <div className="held-top">
                    <span className="chip">Included</span>
                    <span className="held-q">&ldquo;{quote}&rdquo; is in the message.</span>
                  </div>
                  <div className="held-btns">
                    <button className="mini on" type="button" aria-pressed={true} disabled={busy}>
                      Put it in
                    </button>
                    <button className="mini" type="button" aria-pressed={false} disabled={busy} onClick={() => toggleRisk(quote, false)}>
                      Keep it out
                    </button>
                  </div>
                </div>
              ))}

              <div className="receipts">
                <span className="lbl">What changed</span>
                {cut.length ? (
                  <div className="rline">
                    <span className="rtag">Cut</span>
                    <span>{cut.map((r) => <s key={r.quote}>{r.quote}</s>)}</span>
                  </div>
                ) : null}
                {kept.length ? (
                  <div className="rline">
                    <span className="rtag">Kept</span>
                    <span>{[...new Set(kept)].join(" · ")}</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={toast ? "toast show" : "toast"}>{toast}</div>
    </>
  );
}
