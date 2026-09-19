import type { JevApiImpl } from "../types.js";
import { postJson, toAnswers, toUsage } from "./shared.js";

/** Vercel AI SDK evaluation-model spec version this implementation speaks. */
const EVALUATION_MODEL_SPEC_VERSION = "4";
/** Vercel AI Gateway wire protocol version. */
const GATEWAY_PROTOCOL_VERSION = "0.0.1";

interface Wire {
  answers?: Record<string, unknown>;
  usage?: { inputTokens?: number; outputTokens?: number };
  /** typesafe.confidence: { [questionName]: number } rides here, not on the answer. */
  providerMetadata?: { typesafe?: { confidence?: Record<string, number> } };
  warnings?: unknown[];
}

/**
 * Vercel AI Gateway's evaluation modality: POST {baseUrl}/evaluation-model
 * with a bearer key and three gateway-specific headers. Distinct from the
 * other backends: questions use `"boolean"` (not `"noul"`), usage keys are
 * camelCase, and `confidence` is not on the answer but under
 * `providerMetadata.typesafe.confidence`, keyed by question name.
 */
export function vercelEvaluationApi(): JevApiImpl<"vercel-evaluation"> {
  return {
    api: "vercel-evaluation",
    async evaluate(model, request, options) {
      const raw = await postJson<Wire>(
        model.provider,
        `${model.baseUrl.replace(/\/+$/, "")}/evaluation-model`,
        { state: request.state, questions: toWireQuestions(request.questions) },
        {
          ...options,
          headers: {
            ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
            "ai-gateway-protocol-version": GATEWAY_PROTOCOL_VERSION,
            "ai-evaluation-model-specification-version": EVALUATION_MODEL_SPEC_VERSION,
            "ai-model-id": model.slug,
            ...options.headers,
          },
        },
      );
      const answers = toAnswers(model.provider, request.questions, raw.answers);
      const confidence = raw.providerMetadata?.typesafe?.confidence;
      if (confidence) {
        for (const [name, value] of Object.entries(confidence)) {
          const answer = (answers as Record<string, { confidence?: number }>)[name];
          if (answer && typeof value === "number") answer.confidence = value;
        }
      }
      return {
        provider: model.provider,
        model: model.slug,
        answers,
        usage: toUsage(model, {
          ...(raw.usage?.inputTokens !== undefined ? { input_tokens: raw.usage.inputTokens } : {}),
          ...(raw.usage?.outputTokens !== undefined
            ? { output_tokens: raw.usage.outputTokens }
            : {}),
        }),
        raw,
      };
    },
  };
}

/** The wire calls the noul type "boolean"; everything else matches our Question shape. */
function toWireQuestions(questions: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, question] of Object.entries(questions)) {
    const q = question as { type: string };
    out[name] = q.type === "noul" ? { ...q, type: "boolean" } : q;
  }
  return out;
}
