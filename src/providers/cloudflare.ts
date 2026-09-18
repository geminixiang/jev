import { JevAPIError } from "../errors.js";
import { postJson } from "../http.js";
import type { JevProvider, JevRequest, JevResponse, ResolvedEvaluateOptions } from "../types.js";

type CfRaw = { model?: string; answers: JevResponse["answers"]; usage?: JevResponse["usage"] };

/** Minimal shape of a Workers AI binding (`env.AI`). */
export interface WorkersAiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
}

export interface CloudflareRestProviderOptions {
  /** Cloudflare API token with Workers AI permission (JEV_API_KEY). */
  apiKey: string;
  /** Cloudflare account id. Required for REST mode. */
  accountId: string;
  /** Default: https://api.cloudflare.com/client/v4 */
  baseUrl?: string;
  /** Default: "typesafe/jev" — Cloudflare only exposes one slug today. */
  model?: string;
}

/** Cloudflare Workers AI via REST: POST /accounts/{id}/ai/run/typesafe/jev */
export function cloudflareProvider(opts: CloudflareRestProviderOptions): JevProvider {
  const baseUrl = (opts.baseUrl ?? "https://api.cloudflare.com/client/v4").replace(/\/+$/, "");
  const slug = opts.model ?? "typesafe/jev";
  const name = "cloudflare";

  return {
    name,
    async evaluate(request: JevRequest, options: ResolvedEvaluateOptions): Promise<JevResponse> {
      const envelope = await postJson<{ success: boolean; result?: CfRaw; errors?: unknown[] }>(
        name,
        `${baseUrl}/accounts/${opts.accountId}/ai/run/${slug}`,
        { state: request.state, questions: request.questions },
        { ...options, headers: { Authorization: `Bearer ${opts.apiKey}`, ...options.headers } },
      );
      if (!envelope.success || !envelope.result) {
        throw new JevAPIError(name, 200, envelope.errors ?? envelope, new Headers());
      }
      const raw = envelope.result;
      return {
        provider: name,
        model: raw.model,
        answers: raw.answers,
        usage: raw.usage,
        raw: envelope,
      };
    },
  };
}

export interface CloudflareBindingProviderOptions {
  /** `env.AI` inside a Worker. */
  binding: WorkersAiBinding;
  model?: string;
}

/** Cloudflare Workers AI via the in-Worker `env.AI` binding. No API key needed. */
export function cloudflareBindingProvider(opts: CloudflareBindingProviderOptions): JevProvider {
  const slug = opts.model ?? "typesafe/jev";
  const name = "cloudflare-binding";

  return {
    name,
    async evaluate(request: JevRequest, options: ResolvedEvaluateOptions): Promise<JevResponse> {
      options.signal.throwIfAborted();
      const raw = (await opts.binding.run(slug, {
        state: request.state,
        questions: request.questions,
      })) as CfRaw;
      return { provider: name, model: raw.model, answers: raw.answers, usage: raw.usage, raw };
    },
  };
}
