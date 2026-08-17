# The De-Anxietizer

Turns a raw, angry draft into a message you can actually send — without
inventing facts, and without quietly giving away your position.

Any language model will make an angry message polite. That's a prompt, not a
product. Two things are hard enough to build a system around:

- **It must not invent facts.** A rewrite that reads beautifully and contains a
  date that never happened is worse than sending nothing — especially in a
  dispute, where the record matters. Anything the model can't source from your
  own words becomes a blank you fill in.
- **It must not spend your leverage.** Politeness and concession are different
  things. "Sorry to bother you about the heat" turns a legal repair obligation
  into a favour request. When your draft contains something with teeth, the app
  surfaces it for a decision rather than laundering it away.

---

## Running it

```bash
npm install
cp .env.example .env        # add your Groq key
npm run dev                 # http://localhost:3000
```

Get a key at [console.groq.com/keys](https://console.groq.com/keys). Check
`GROQ_MODEL` against [the model list](https://console.groq.com/docs/models) —
retired ids fail with a 404 that reads like an auth error.

| Command | What it does |
|---|---|
| `npm run dev` | The app, locally |
| `npm test` | Unit tests. No API key needed. |
| `npm run watch` | Same, re-running on save |
| `npm run eval` | Scores the golden set against a real model. Costs API calls. |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build |

---

## How it works

Four stages, two model calls. Everything between them is ordinary code.

```
  your draft
      │
      ▼
  ┌─────────┐   model call 1 — pull out every date, amount, name and
  │ EXTRACT │   claim, plus anything risky. This becomes the whitelist
  └────┬────┘   the message is later checked against.
       ▼
  ┌─────────┐   model call 2 — write the message using only those facts.
  │  WRITE  │◄──────────────┐  Anything missing becomes a [blank].
  └────┬────┘               │
       ▼                    │
  ┌─────────┐               │  the specific reason each check failed,
  │  CHECK  │───────────────┘  fed back as an instruction. Max 3 tries.
  └────┬────┘   eight guardrails. no model involved.
       ▼
  ┌─────────┐   the message, the blanks to fill, what was cut,
  │ PRESENT │   and anything held back for your decision.
  └─────────┘
```

The model is never trusted and never asked to check itself. It writes; code
decides whether what it wrote is acceptable.

---

## The guardrails

Eight rules in `src/checks/`. Each is a plain function — string in, list of
failures out. No network, no model, no dependencies, so they run in
milliseconds and are testable without a key.

| Check | The rule |
|---|---|
| `entitySubset` | Every date, number and name traces back to your draft |
| `riskAccounted` | Held-back items stay out, included ones go in, insults never survive |
| `subjectPresent` | The message names what it's actually about |
| `noNewCommitment` | No promises you didn't make |
| `noApology` | No apologising for someone else's failure |
| `ctaPresent` | It actually asks for something |
| `cliche` | No corporate filler |
| `length` | Within the channel's word cap (40 text / 60 chat / 100 email) |

Each failure carries three things:

```ts
{
  check:  "entity_subset",                              // stable id, for reporting
  reason: "not traceable to the draft: Tuesday, Dave",  // for you and the logs
  repair: "You introduced specifics that do not..."     // sent verbatim to the model
}
```

That third field is why the retry loop is four lines — the check that found the
problem is the thing that knows how to describe the fix.

**`riskAccounted` is the only one that can block.** Everything else degrades:
after three attempts you get the message with the warnings shown. But if a
decision you made explicitly couldn't be honoured, shipping it anyway would
misrepresent what you're about to send.

---

## Layout

```
src/
  types.ts              every shared contract
  pipeline.ts           extract → write → check → repair
  checks/               the eight guardrails, one file each
  prompts/              extract.ts and write.ts — the only prose that matters
  model/
    adapter.ts          the seam. text() and json(), nothing else
    groq.ts             Groq over plain fetch
    fake.ts             scripted, for testing without a key
  eval/
    golden.ts           14 end-to-end cases, a third written to break it
    run.ts              scores them and prints per-check failure rates
app/
  api/rewrite/route.ts  the only route that talks to a model
  components/           the interface
```

**The model sits behind an adapter on purpose.** Nothing else in the codebase
knows a model exists, so swapping providers is a config change plus one eval
run — not a rewrite, and not a guess about whether quality dropped.

---

## The golden set

`npm run eval` runs 14 real drafts through the whole pipeline and scores what
comes out. It is the only thing that can answer "did that prompt change help?"

It has already caught things no unit test could:

- a model that ate its entire token budget reasoning and returned nothing
- the subject of a message being silently deleted as an "invented fact"
- `[new date]` being invisible to a regex that only allowed `[date]`
- the model substituting "I will be forced to withhold rent" for a threat the
  user had explicitly chosen to hold back

Two caveats worth knowing. Runs vary — the same suite scored 13/14 and then
11/14 with different cases failing, so treat one run as a sample rather than a
verdict. And the best new cases come from real failures, not imagination: when
the app produces something you wouldn't send, that draft becomes the next case.

---

## Deploying

Push to GitHub, import in Vercel, set `GROQ_API_KEY` and `GROQ_MODEL` as
environment variables. The route already declares `maxDuration = 60` for the
worst case of four sequential model calls.

Note that a public URL means anyone who finds it spends your API quota.
