import { postJson } from "../http.js";
import type { JevProvider, JevRequest, JevResponse, ResolvedEvaluateOptions } from "../types.js";
import { canonicalJevVersion } from "./model.js";

export interface OpenRouterProviderOptions {
  apiKey: string;
  /** Default: https://openrouter.ai/api */
  baseUrl?: string;
  /** Sets HTTP-Referer for OpenRouter rankings. */
  siteUrl?: string;
  /** Sets X-OpenRouter-Title for OpenRouter rankings. */
  siteName?: string;
}

/** OpenRouter Decisions API: POST {baseUrl}/alpha/decisions, model "~typesafe/jev-<ver>" */
export function openrouterProvider(opts: OpenRouterProviderOptions): JevProvider {
  const baseUrl = (opts.baseUrl ?? "https://openrouter.ai/api").replace(/\/+$/, "");
  const name = "openrouter";

  return {
    name,
    async evaluate(request: JevRequest, options: ResolvedEvaluateOptions): Promise<JevResponse> {
      const version = canonicalJevVersion(request.model);
      const headers: Record<string, string> = { Authorization: `Bearer ${opts.apiKey}` };
      if (opts.siteUrl) headers["HTTP-Referer"] = opts.siteUrl;
      if (opts.siteName) headers["X-OpenRouter-Title"] = opts.siteName;

      const raw = await postJson<{
        model?: string;
        answers: JevResponse["answers"];
        usage?: JevResponse["usage"];
      }>(
        name,
        `${baseUrl}/alpha/decisions`,
        { model: `~typesafe/jev-${version}`, state: request.state, questions: request.questions },
        { ...options, headers: { ...headers, ...options.headers } },
      );
      return { provider: name, model: raw.model, answers: raw.answers, usage: raw.usage, raw };
    },
  };
}
