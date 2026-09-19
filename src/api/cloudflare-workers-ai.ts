import { JevAPIError, JevConfigError } from "../errors.js";
import type { JevApiImpl } from "../types.js";
import { type WireUsage, postJson, toAnswers, toUsage } from "./shared.js";

interface Wire {
  success?: boolean;
  result?: { model?: string; answers?: Record<string, unknown>; usage?: WireUsage };
  errors?: unknown[];
}

/** Env key carrying the Cloudflare account id; resolved through provider auth. */
export const CLOUDFLARE_ACCOUNT_ID_ENV = "CLOUDFLARE_ACCOUNT_ID";

/**
 * Cloudflare Workers AI REST: POST {baseUrl}/accounts/{account}/ai/run/{slug}.
 * `{account}` in `baseUrl` is filled from `options.env.CLOUDFLARE_ACCOUNT_ID`.
 */
export function cloudflareWorkersAiApi(): JevApiImpl<"cloudflare-workers-ai"> {
  return {
    api: "cloudflare-workers-ai",
    async evaluate(model, request, options) {
      const accountId = options.env[CLOUDFLARE_ACCOUNT_ID_ENV];
      if (!accountId) {
        throw new JevConfigError(
          `Cloudflare Workers AI needs ${CLOUDFLARE_ACCOUNT_ID_ENV} (provider env).`,
        );
      }
      const base = model.baseUrl.replace(/\/+$/, "").replace("{account}", accountId);
      const raw = await postJson<Wire>(
        model.provider,
        `${base}/ai/run/${model.slug}`,
        { state: request.state, questions: request.questions },
        {
          ...options,
          headers: {
            ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
            ...options.headers,
          },
        },
      );
      if (!raw.success || !raw.result) {
        throw new JevAPIError(model.provider, 200, raw.errors ?? raw, new Headers());
      }
      return {
        provider: model.provider,
        model: raw.result.model ?? model.slug,
        answers: toAnswers(model.provider, request.questions, raw.result.answers),
        usage: toUsage(model, raw.result.usage),
        raw,
      };
    },
  };
}
