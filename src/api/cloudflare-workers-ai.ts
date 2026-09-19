import { JevAPIError, JevConfigError } from "../errors.js";
import type { JevApiImpl } from "../types.js";
import { type WireUsage, postJson, toAnswers, toUsage } from "./shared.js";

interface InnerResult {
  model?: string;
  answers?: Record<string, unknown>;
  usage?: WireUsage;
}

interface Wire {
  success?: boolean;
  result?: {
    state?: string;
    result?: InnerResult;
  };
  errors?: unknown[];
}

/** Env key carrying the Cloudflare account id; resolved through provider auth. */
export const CLOUDFLARE_ACCOUNT_ID_ENV = "CLOUDFLARE_ACCOUNT_ID";

/**
 * Cloudflare's unified AI run endpoint: `POST {baseUrl}/accounts/{account}/ai/run`
 * with `{ model, input }` in the body — third-party models like `typesafe/jev`
 * do not take the classic `/ai/run/{model_name}` path form. The response
 * nests the actual payload two levels deep: `{ result: { state, result: {...} } }`.
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
        `${base}/ai/run`,
        { model: model.slug, input: { state: request.state, questions: request.questions } },
        {
          ...options,
          headers: {
            ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
            ...options.headers,
          },
        },
      );
      const inner = raw.result?.result;
      if (!raw.success || !inner) {
        throw new JevAPIError(model.provider, 200, raw.errors ?? raw, new Headers());
      }
      return {
        provider: model.provider,
        model: inner.model ?? model.slug,
        answers: toAnswers(model.provider, request.questions, inner.answers),
        usage: toUsage(model, inner.usage),
        raw,
      };
    },
  };
}
