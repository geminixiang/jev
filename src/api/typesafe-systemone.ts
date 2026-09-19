import type { JevApiImpl } from "../types.js";
import { type WireUsage, postJson, toAnswers, toUsage } from "./shared.js";

interface Wire {
  model?: string;
  answers?: Record<string, unknown>;
  usage?: WireUsage;
}

/** TypeSafe AI direct: POST {baseUrl}/v1/systemone with a bearer key. */
export function typesafeSystemOneApi(): JevApiImpl<"typesafe-systemone"> {
  return {
    api: "typesafe-systemone",
    async evaluate(model, request, options) {
      const raw = await postJson<Wire>(
        model.provider,
        `${model.baseUrl.replace(/\/+$/, "")}/v1/systemone`,
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
