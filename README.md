# @geminixiang/jev

[![CI](https://github.com/geminixiang/jev/actions/workflows/ci.yml/badge.svg)](https://github.com/geminixiang/jev/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@geminixiang/jev)](https://www.npmjs.com/package/@geminixiang/jev)

TypeScript SDK for TypeSafe's **Jev** decision model, shaped like
[`@earendil-works/pi-ai`](https://github.com/earendil-works/pi-ai): providers own auth,
a model catalog, and a wire implementation; a `JevModels` collection resolves credentials
and dispatches. Jev is not a chat model, so it does not fit pi-ai's `Provider`/`stream()`
contract — this package is the decisions-side counterpart, the way pi-ai's `ImagesModels`
is the image-side one.

Jev answers typed questions about a *state* with calibrated probabilities:

| Question | Answer |
|---|---|
| `noul` | probability that the answer is yes, 0–1 |
| `choice` | one option from a set you define, with a probability per option and a `confidence` |
| `score` | a position on an ordered rubric, with a probability per level and a `confidence` |

## Install

```sh
npm install @geminixiang/jev @earendil-works/pi-ai
```

`@earendil-works/pi-ai` is a peer dependency; only its auth layer (`envApiKeyAuth`,
`CredentialStore`, `AuthContext`) is used, so an app already on pi-ai shares one
credential store across chat, image, and decision providers.

## Quick start

```ts
import { choice, createBuiltinJevModels, noul, score } from "@geminixiang/jev";

const models = createBuiltinJevModels(); // typesafe, openrouter, cloudflare
const model = models.getModel("openrouter", "jev-latest")!;

const { answers, usage } = await models.evaluate(model, {
  state: { ticket: "Help! My payouts have been failing for 3 days." },
  questions: {
    is_urgent: noul("Does this message convey urgency?"),
    department: choice("Which team should handle this?", {
      billing: "Payments, invoicing, refunds",
      technical: "Bugs, outages, integrations",
    }),
    frustration: score("How frustrated is the customer?", ["Calm", "Frustrated", "Very angry"]),
  },
});

answers.is_urgent.noul;            // 0.95
answers.department.choice;         // "billing"  (typed: "billing" | "technical")
answers.department.confidence;     // 0.8
answers.frustration.score;         // 1.04
usage.cost.total;                  // USD
```

`state`, `instructions`, and criteria descriptions accept text or JSON structure, exactly
as the [TypeSafe API](https://docs.typesafe.ai/primitives/advanced) does.

## Providers

| Provider id | Backend | Auth |
|---|---|---|
| `typesafe` | `api.typesafe.ai/v1/systemone` | `TYPESAFE_API_KEY` |
| `openrouter` | `openrouter.ai/api/alpha/decisions` | `OPENROUTER_API_KEY` |
| `cloudflare` | Workers AI REST `…/ai/run/typesafe/jev` | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` |

Model ids are provider-neutral (`jev-latest`, `jev-1.13`); each catalog entry carries the
slug its backend expects. A stored credential wins over the env var, as in pi-ai.

```ts
const models = createBuiltinJevModels({
  credentials,          // pi-ai CredentialStore; default in-memory
  authContext,          // env/file access; default process.env
  fetch,                // undici, msw, logging wrapper…
  timeoutMs: 30_000,
  maxRetries: 2,        // 408 / 429 / 5xx / connection / timeout only
});

await models.getAvailable();              // models whose provider has a key
await models.getAuth("openrouter");       // AuthResult | undefined

await models.evaluate(model, request, {
  apiKey, env, headers, signal, timeoutMs, maxRetries, fetch,   // per-call overrides
});
```

### Custom providers

```ts
import { createJevProvider, openrouterDecisionsApi } from "@geminixiang/jev";
import { envApiKeyAuth } from "@earendil-works/pi-ai";

const proxy = createJevProvider({
  id: "my-proxy",
  auth: { apiKey: envApiKeyAuth("Proxy key", ["MY_PROXY_KEY"]) },
  models: [{
    id: "jev-latest", name: "Jev via proxy", api: "openrouter-decisions", provider: "my-proxy",
    baseUrl: "https://proxy.example/api", slug: "~typesafe/jev-latest", cost: { input: 0.042, output: 0 },
  }],
  api: openrouterDecisionsApi(),
});
models.setProvider(proxy);
```

Implement `JevApiImpl` for a new wire protocol; the three built-in ones live under `api/`.

## Errors

| Class | When | Retried |
|---|---|---|
| `JevConfigError` | malformed question, unknown provider | — |
| `JevAuthError` | provider has no usable credential | — |
| `JevAPIError` | non-2xx; `.status`, `.body`, `.headers` | 408 / 429 / 5xx |
| `JevResponseError` | 2xx but the body is not an answers map | — |
| `JevConnectionError` | DNS / socket failure | yes |
| `JevTimeoutError` | `timeoutMs` exceeded | yes |
| `JevAbortError` | caller's `AbortSignal` fired | — |

## Development

```sh
npm run check                                                  # lint + typecheck + test + build + package lint
JEV_LIVE=1 JEV_LIVE_PROVIDER=openrouter OPENROUTER_API_KEY=… npm run test:live
```

## License

MIT
