# Contributing

1. `nvm use && npm ci`
2. Make changes; keep `npm run check` green.
3. `npm run changeset` and describe the change (patch / minor / major).
4. Open a PR against `main`.

## Adding a provider

Implement `JevProvider` in `src/providers/<name>.ts`, normalise the response into
`JevResponse`, export it from `src/index.ts`, and add a mocked-fetch test in
`src/providers.test.ts`. If it's a first-class name, wire it in `resolveProvider`
(`src/client.ts`) and extend `ProviderName`.

## Live tests

`JEV_API_KEY=... JEV_LIVE_PROVIDER=<name> npm run test:live` — not run in CI.
