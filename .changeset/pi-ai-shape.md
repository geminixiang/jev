---
"jev-sdk": minor
---

Rebuilt in the shape of `@earendil-works/pi-ai`: `createJevModels` / `createBuiltinJevModels` collections, `createJevProvider` with pi-ai `ProviderAuth`, per-provider model catalogs with provider-neutral ids, and importable wire implementations (`typesafeSystemOneApi`, `openrouterDecisionsApi`, `cloudflareWorkersAiApi`). Auth now resolves per provider (`TYPESAFE_API_KEY`, `OPENROUTER_API_KEY`, `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`) through a shared `CredentialStore` instead of a single `JEV_API_KEY`. Usage is normalised to pi-ai's `{ input, output, totalTokens, cost }`. The `JevClient` class is removed.
