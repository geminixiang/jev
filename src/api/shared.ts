import { JevAPIError, JevAbortError, JevConnectionError, JevResponseError } from "../errors.js";
import type {
  Answer,
  Answers,
  JevModel,
  JevUsage,
  Questions,
  ResolvedEvaluateOptions,
} from "../types.js";

/** POST JSON, parse JSON. Throws the SDK's typed errors. */
export async function postJson<T = unknown>(
  provider: string,
  url: string,
  body: unknown,
  options: ResolvedEvaluateOptions,
): Promise<T> {
  let response: Response;
  try {
    response = await options.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...options.headers },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    if (options.signal.aborted) throw options.signal.reason ?? new JevAbortError();
    throw new JevConnectionError(provider, err);
  }

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep raw text */
  }
  if (!response.ok) throw new JevAPIError(provider, response.status, parsed, response.headers);
  return parsed as T;
}

/** Usage as the backends report it (snake_case). */
export interface WireUsage {
  input_tokens?: number;
  output_tokens?: number;
  cost?: number;
}

export function toUsage(model: JevModel, wire: WireUsage | undefined): JevUsage {
  const input = wire?.input_tokens ?? 0;
  const output = wire?.output_tokens ?? 0;
  const inputCost = (input / 1_000_000) * model.cost.input;
  const outputCost = (output / 1_000_000) * model.cost.output;
  const total = wire?.cost ?? inputCost + outputCost;
  return {
    input,
    output,
    totalTokens: input + output,
    cost: { input: inputCost, output: outputCost, total },
  };
}

/**
 * Normalise an answers map: every backend returns the same three shapes, but
 * optional fields (`confidence`, `legend`) vary; fill safe defaults so callers
 * get one contract.
 */
export function toAnswers<Qs extends Questions>(
  provider: string,
  questions: Qs,
  wire: Record<string, unknown> | undefined,
): Answers<Qs> {
  const out: Record<string, Answer> = {};
  for (const name of Object.keys(questions)) {
    const raw = wire?.[name];
    if (!raw || typeof raw !== "object") {
      throw new JevResponseError(provider, `response missing answer for "${name}"`, wire);
    }
    const a = raw as Record<string, unknown>;
    // "noul" (TypeSafe/OpenRouter wire name) and "boolean" (Vercel AI Gateway's
    // AI SDK naming) are the same question type; both normalise to `noul`.
    if (a.type === "noul" || a.type === "boolean") {
      out[name] = { type: "noul", noul: num(a.noul ?? a.probability) };
    } else if (a.type === "choice") {
      out[name] = {
        type: "choice",
        choice: String(a.choice ?? ""),
        probabilities: (a.probabilities as Record<string, number>) ?? {},
        ...(typeof a.confidence === "number" ? { confidence: a.confidence } : {}),
      };
    } else if (a.type === "score") {
      out[name] = {
        type: "score",
        score: num(a.score),
        probabilities: (a.probabilities as Record<string, number>) ?? {},
        ...(a.legend ? { legend: a.legend as Record<string, never> } : {}),
        ...(typeof a.confidence === "number" ? { confidence: a.confidence } : {}),
      };
    } else {
      throw new JevResponseError(
        provider,
        `answer "${name}" has unknown type ${String(a.type)}`,
        wire,
      );
    }
  }
  return out as Answers<Qs>;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
