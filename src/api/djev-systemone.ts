import type { JevApiImpl, JevRequestExtensions } from "../types.js";
import { type WireUsage, postJson, toAnswers, toUsage } from "./shared.js";

interface Wire {
  model?: string;
  answers?: Record<string, unknown>;
  usage?: WireUsage;
  diagnostics?: unknown;
}

const EXTENSION_KEYS = [
  "seed",
  "samples",
  "auto_max",
  "auto_threshold",
  "think",
  "instructions",
  "chunk_rows",
  "chunk_prompt",
  "sequential",
  "ask",
  "steps",
  "images",
] as const satisfies readonly (keyof JevRequestExtensions)[];

/**
 * djev-spark's `/v1/systemone`: TypeSafe's protocol served by a self-hosted
 * DiffusionGemma box (https://github.com/geminixiang/djev-spark), plus its
 * extensions — request keys like `seed`, `samples`, `think`, `images`, and
 * per-question `depends_on` / `ask_if` / `alone` — all passed through on the
 * wire unchanged. The server runs keyless unless started with `API_KEY`, so
 * a missing bearer key is not an error here.
 */
export function djevSystemOneApi(): JevApiImpl<"djev-systemone"> {
  return {
    api: "djev-systemone",
    async evaluate(model, request, options) {
      const body: Record<string, unknown> = {
        model: model.slug,
        state: request.state,
        questions: request.questions,
      };
      for (const key of EXTENSION_KEYS) {
        if (request[key] !== undefined) body[key] = request[key];
      }
      const raw = await postJson<Wire>(
        model.provider,
        `${model.baseUrl.replace(/\/+$/, "")}/v1/systemone`,
        body,
        {
          ...options,
          headers: {
            ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
            ...options.headers,
          },
        },
      );
      return {
        provider: model.provider,
        model: raw.model ?? model.slug,
        answers: toAnswers(model.provider, request.questions, raw.answers),
        usage: toUsage(model, raw.usage),
        raw,
      };
    },
  };
}
