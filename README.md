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
| `choice` | one option from a set you define, with a probability per option and (where the backend reports it) a `confidence` |
| `score` | a position on an ordered rubric, with a probability per level and (where the backend reports it) a `confidence` |

`confidence` is optional — Vercel's evaluation modality omits it from the answer (it's
nested in `providerMetadata.typesafe.confidence`; the provider normalizes it), so treat
it as possibly absent.

## Using it from Pi

If you use the [Pi coding agent](https://github.com/badlogic/pi-mono),
[`@geminixiang/pi-jev`](https://github.com/geminixiang/pi-stuff/tree/main/packages/pi-jev)
wraps this SDK as a `jev` tool plus a skill that tells the agent when to reach for it:

```sh
pi install npm:@geminixiang/pi-jev
```

Otherwise, install this package directly.

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
| `cloudflare` | Cloudflare's unified `…/ai/run` endpoint (third-party model) | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` |
| `vercel` | Vercel AI Gateway evaluation modality | `AI_GATEWAY_API_KEY` (or `VERCEL_API_KEY`) |
| `djev` (not builtin, see below) | a self-hosted [djev-spark](https://github.com/geminixiang/djev-spark) box | keyless, or `DJEV_API_KEY` |

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

### Self-hosted: djev-spark

[djev-spark](https://github.com/geminixiang/djev-spark) serves TypeSafe's `/v1/systemone`
protocol from your own box (DiffusionGemma on a DGX Spark). Since a self-hosted endpoint
has no fixed address, the provider is created explicitly rather than shipped as a builtin:

```ts
import { choice, createJevModels, djevProvider } from "@geminixiang/jev";

const models = createJevModels();
models.setProvider(djevProvider({ baseUrl: "http://spark:8011" }));
const model = models.getModel("djev", "jev-latest")!;
```

The server is keyless unless started with `API_KEY`; then set `DJEV_API_KEY` (or pass
`apiKey`). `DJEV_BASE_URL` in the env overrides `baseUrl`, and a custom `id` lets several
boxes coexist: `djevProvider({ id: "spark-b", baseUrl: "http://b:8011" })`.

> **Images work only here.** Hosted Jev [doesn't accept images yet](https://docs.typesafe.ai/concepts/state) —
> a backend limit on all four cloud providers, not a gap in this SDK. DiffusionGemma is
> multimodal, so djev-spark takes `images` ahead of the cloud APIs catching up; sending
> it to a cloud provider is silently dropped, not an error.

The `djev` wire also carries the server's extensions, all optional and ignored-by-design
on cloud providers (the built-in cloud APIs never send them):

```ts
const { answers } = await models.evaluate(model, {
  state: { frame: "..." },
  seed: 7,                    // reproducible reads
  think: 64,                  // thought tokens before the read
  samples: "auto",            // re-read while entropy is high
  images: ["data:image/png;base64,..."],
  questions: {
    ahead: choice("What is ahead?", { clear: null, wall: null }),
    side: {
      ...choice("Which half is the obstacle in?", { left: null, right: null }),
      ask_if: { ahead: ["wall"] },   // asked only after a "wall" answer
    },
  },
});
answers.side;   // ChoiceAnswer | null — null when the gate skipped it
```

Per-question `depends_on` / `ask_if` / `alone` and request-level `seed`, `samples`,
`auto_max`, `auto_threshold`, `think`, `instructions`, `chunk_rows`, `chunk_prompt`,
`sequential`, `ask`, `steps`, `images` are documented in
[djev-spark's README](https://github.com/geminixiang/djev-spark#extensions).

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

> **Cloudflare note:** `typesafe/jev` is a third-party model reached through Cloudflare's
> unified `POST /accounts/{id}/ai/run` endpoint (`{ model, input: { state, questions } }`),
> not the classic `/ai/run/{model_name}` path native `@cf/...` models use — see
> [developers.cloudflare.com/ai/models/typesafe/jev/](https://developers.cloudflare.com/ai/models/typesafe/jev/).

## Development

```sh
npm run check                                                  # lint + typecheck + test + build + package lint
JEV_LIVE=1 JEV_LIVE_PROVIDER=openrouter OPENROUTER_API_KEY=… npm run test:live
```

## License

MIT
