import type { JevApiImpl } from "../types.js";
import { type WireUsage, postJson, toAnswers, toUsage } from "./shared.js";

interface Wire {
  model?: string;
  answers?: Record<string, unknown>;
  usage?: WireUsage;
  error?: { message?: string; code?: number };
}

/** OpenRouter Decisions API: POST {baseUrl}/alpha/decisions with a bearer key. */
export function openrouterDecisionsApi(): JevApiImpl<"openrouter-decisions"> {
  return {
    api: "openrouter-decisions",
    async evaluate(model, request, options) {
      const raw = await postJson<Wire>(
        model.provider,
        `${model.baseUrl.replace(/\/+$/, "")}/alpha/decisions`,
        { model: model.slug, state: request.state, questions: request.questions },
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
