import type { ApiKeyAuth, AuthResult } from "@earendil-works/pi-ai";
import { CLOUDFLARE_ACCOUNT_ID_ENV, cloudflareWorkersAiApi } from "../api/cloudflare-workers-ai.js";
import { createJevProvider } from "../provider.js";
import type { JevModel, JevProvider } from "../types.js";
import { JEV_LIST_COST } from "./catalog.js";

export const CLOUDFLARE_BASE_URL = "https://api.cloudflare.com/client/v4/accounts/{account}";
const CLOUDFLARE_API_TOKEN_ENV = "CLOUDFLARE_API_TOKEN";

/**
 * UNVERIFIED as of 2026-09: `typesafe/jev` is not present in this account's
 * Workers AI model catalog (`GET /accounts/{id}/ai/models/search`, 308
 * models, no match) and its per-model doc page 404s, despite an indexed page
 * appearing to describe it. `POST /ai/run/typesafe/jev` returns
 * `7000 No route for that URI`. Kept for when/if Cloudflare lists it; do not
 * rely on this provider until it is confirmed live.
 */

/** Cloudflare exposes one slug and does not version it. */
export const CLOUDFLARE_MODELS: readonly JevModel<"cloudflare-workers-ai">[] = [
  {
    id: "jev-latest",
    name: "Jev (Cloudflare Workers AI)",
    api: "cloudflare-workers-ai",
    provider: "cloudflare",
    baseUrl: CLOUDFLARE_BASE_URL,
    slug: "typesafe/jev",
    cost: JEV_LIST_COST,
  },
];

/**
 * Key plus provider env: the account id rides in `credential.env` /
 * `CLOUDFLARE_ACCOUNT_ID`, the same pattern pi-ai's Cloudflare providers use.
 */
const cloudflareAuth: ApiKeyAuth = {
  name: "Cloudflare API token",
  async login(interaction) {
    const key = await interaction.prompt({
      type: "secret",
      message: "Cloudflare API token (Workers AI)",
    });
    const account = await interaction.prompt({ type: "text", message: "Cloudflare account id" });
    return { type: "api_key", key, env: { [CLOUDFLARE_ACCOUNT_ID_ENV]: account } };
  },
  async resolve({ ctx, credential }): Promise<AuthResult | undefined> {
    const apiKey = credential?.key ?? (await ctx.env(CLOUDFLARE_API_TOKEN_ENV));
    const account =
      credential?.env?.[CLOUDFLARE_ACCOUNT_ID_ENV] ?? (await ctx.env(CLOUDFLARE_ACCOUNT_ID_ENV));
    if (!apiKey || !account) return undefined;
    return {
      auth: { apiKey },
      env: { [CLOUDFLARE_ACCOUNT_ID_ENV]: account },
      source: credential?.key ? "stored credential" : CLOUDFLARE_API_TOKEN_ENV,
    };
  },
};

/** Cloudflare Workers AI REST. Key: `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`. */
export function cloudflareProvider(): JevProvider<"cloudflare-workers-ai"> {
  return createJevProvider({
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    auth: { apiKey: cloudflareAuth },
    models: CLOUDFLARE_MODELS,
    api: cloudflareWorkersAiApi(),
  });
}
