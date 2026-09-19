# @geminixiang/jev

## 0.3.1

### Patch Changes

- Fix the `cloudflare` provider: `typesafe/jev` is a third-party model reached through Cloudflare's unified `POST /accounts/{id}/ai/run` endpoint (`{ model, input: { state, questions } }`, response nested under `result.result`), not the classic `/ai/run/{model_name}` path form. Verified live.

## 0.3.0

### Minor Changes

- Add a `vercel` provider for Jev through Vercel AI Gateway's evaluation modality (`AI_GATEWAY_API_KEY` / `VERCEL_API_KEY`). Its wire format differs from TypeSafe/OpenRouter (`boolean` instead of `noul`, camelCase usage, confidence under `providerMetadata.typesafe.confidence`); the provider normalises all of it to the same `Answers`/`JevUsage` shape. `ChoiceAnswer.confidence` and `ScoreAnswer.confidence` are now optional to reflect that not every backend reports it.

## 0.2.0

### Minor Changes

- 8530776: Rebuilt in the shape of `@earendil-works/pi-ai`: `createJevModels` / `createBuiltinJevModels` collections, `createJevProvider` with pi-ai `ProviderAuth`, per-provider model catalogs with provider-neutral ids, and importable wire implementations (`typesafeSystemOneApi`, `openrouterDecisionsApi`, `cloudflareWorkersAiApi`). Auth now resolves per provider (`TYPESAFE_API_KEY`, `OPENROUTER_API_KEY`, `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`) through a shared `CredentialStore` instead of a single `JEV_API_KEY`. Usage is normalised to pi-ai's `{ input, output, totalTokens, cost }`. The `JevClient` class is removed.

## 0.1.0

- Initial release: TypeSafe, OpenRouter, Cloudflare (REST + binding) providers, typed questions/answers, retries, timeouts.
