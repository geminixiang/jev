# jev-sdk

[![CI](https://github.com/geminixiang/jev-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/geminixiang/jev-sdk/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/jev-sdk)](https://www.npmjs.com/package/jev-sdk)
![types](https://img.shields.io/badge/types-included-blue)
![license](https://img.shields.io/badge/license-MIT-green)

Provider-agnostic TypeScript SDK for TypeSafe's **Jev** structured-decision model.
One API, one env var, three backends.

Jev doesn't generate text. You give it a *state* and typed *questions*; it returns
calibrated answers your code can act on directly:

| Question | Answer |
|---|---|
| `noul` | probability that the answer is "yes" (0–1) |
| `choice` | one option from a set you define, plus a full probability distribution and confidence |
| `score` | a position on an ordered rubric, plus distribution and confidence |

## Install

```sh
npm install jev-sdk
```

Node ≥ 18 (uses global `fetch`). Ships ESM + CJS + `.d.ts`.

## Quick start

```sh
export JEV_API_KEY=...
```

```ts
import { JevClient, noul, choice, score } from "jev-sdk";

const jev = new JevClient("openrouter"); // "typesafe" | "openrouter" | "cloudflare"

const { answers } = await jev.evaluate({
  state: "Help! My payouts have been failing for 3 days.",
  questions: {
    is_urgent: noul("Does this convey urgency?", {
      true: "Explicitly time-sensitive",
      false: "No urgency expressed",
    }),
    department: choice("Which team should handle this?", {
      billing: "Payments, invoicing, refunds",
      technical: "Bugs, outages, integrations",
      sales: "Pricing, upgrades, new accounts",
    }),
    frustration: score("How frustrated is the customer?", ["Calm", "Frustrated", "Very angry"]),
  },
});

answers.is_urgent.noul;           // 0.95
answers.department.choice;        // "billing"  — typed as "billing" | "technical" | "sales"
answers.department.probabilities; // { billing: 0.87, technical: 0.13, sales: 0 }
answers.department.confidence;    // 0.8
answers.frustration.score;        // 1.04 (0 = Calm … 2 = Very angry)
```

Answer types are inferred from your questions — misspelt question names or option keys
are compile errors.

One-question shortcut:

```ts
const a = await jev.ask("I want my money back", noul("Is this a refund request?"));
if (a.noul > 0.9) refund();
```

## Providers

The provider is chosen in code. **`JEV_API_KEY` is the only environment variable the SDK
reads**, and it's the key for whichever provider you construct.

| `new JevClient(...)` | Backend | Endpoint |
|---|---|---|
| `"typesafe"` | TypeSafe AI (direct) | `api.typesafe.ai/v1/systemone` |
| `"openrouter"` | OpenRouter Decisions API | `openrouter.ai/api/alpha/decisions` |
| `"cloudflare"` | Cloudflare Workers AI (REST) | `api.cloudflare.com/…/ai/run/typesafe/jev` |
| `cloudflareBindingProvider({ binding: env.AI })` | Workers AI in-Worker binding (no key) | — |
| any `JevProvider` | your own backend | — |

```ts
new JevClient("typesafe", { apiKey, model: "jev-1.13" });
new JevClient("openrouter", { siteUrl: "https://myapp.dev", siteName: "MyApp" });
new JevClient("cloudflare", { accountId: "..." });
new JevClient(cloudflareBindingProvider({ binding: env.AI }));
```

Model names are normalised per provider: pass `"jev-latest"`, `"jev-1.13"`,
`"~typesafe/jev-latest"` etc. and the right slug is sent.

## Options

```ts
new JevClient("typesafe", {
  apiKey: "...",          // default: process.env.JEV_API_KEY
  model: "jev-latest",    // default model
  baseUrl: "...",         // override provider URL (proxies, self-hosting)
  timeoutMs: 30_000,      // per-request timeout
  retry: { maxRetries: 2, initialDelayMs: 500, maxDelayMs: 8000 },
  headers: { "X-Trace": "..." },
  fetch: customFetch,     // e.g. undici, msw, or a logging wrapper
  dangerouslyAllowBrowser: false,
});

await jev.evaluate(request, { signal, timeoutMs, headers }); // per-call overrides
```

The client refuses to construct in a browser main thread unless `dangerouslyAllowBrowser`
is set, since that would expose your key.

## Errors

All errors extend `JevError`:

| Class | When | Retried |
|---|---|---|
| `JevConfigError` | missing key, unknown provider, malformed question | — |
| `JevAPIError` | non-2xx response; `.status`, `.body`, `.headers`, `.isRateLimit`, `.isAuth` | 408 / 429 / 5xx |
| `JevConnectionError` | DNS / socket failure | yes |
| `JevTimeoutError` | `timeoutMs` exceeded | yes |
| `JevAbortError` | caller's `AbortSignal` fired | no |

Retries use exponential backoff with jitter and honour `Retry-After`.

## Response shape

```ts
interface JevResponse<Qs> {
  provider: string;        // "openrouter" …
  model?: string;          // e.g. "jev-1.13.0"
  answers: Answers<Qs>;    // typed by your questions
  usage?: { input_tokens: number; output_tokens: number };
  raw?: unknown;           // untouched provider payload
}
```

## Examples

See [`examples/`](./examples): support-ticket routing and a Cloudflare Worker.

## Development

```sh
npm run check           # lint + typecheck + test + build + package lint
npm run test:coverage
JEV_API_KEY=... JEV_LIVE_PROVIDER=openrouter npm run test:live   # hits the real API
npm run changeset       # record a change for release
```

Releases are automated with [Changesets](https://github.com/changesets/changesets): merge
to `main` opens/updates a release PR; merging that PR publishes to npm with provenance.

## License

MIT
