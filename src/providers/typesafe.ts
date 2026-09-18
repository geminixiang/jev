import { postJson } from "../http.js";
import type { JevProvider, JevRequest, JevResponse, ResolvedEvaluateOptions } from "../types.js";
import { canonicalJevVersion } from "./model.js";

export interface TypeSafeProviderOptions {
  apiKey: string;
  /** Default: https://api.typesafe.ai */
  baseUrl?: string;
}

/** Direct TypeSafe AI API: POST {baseUrl}/v1/systemone */
export function typesafeProvider(opts: TypeSafeProviderOptions): JevProvider {
  const baseUrl = (opts.baseUrl ?? "https://api.typesafe.ai").replace(/\/+$/, "");
  const name = "typesafe";

  return {
    name,
    async evaluate(request: JevRequest, options: ResolvedEvaluateOptions): Promise<JevResponse> {
      const version = canonicalJevVersion(request.model);
      const raw = await postJson<{
        model: string;
        answers: JevResponse["answers"];
        usage?: JevResponse["usage"];
      }>(
        name,
        `${baseUrl}/v1/systemone`,
        { model: `jev-${version}`, state: request.state, questions: request.questions },
        {
          ...options,
          headers: { Authorization: `Bearer ${opts.apiKey}`, ...options.headers },
        },
      );
      return { provider: name, model: raw.model, answers: raw.answers, usage: raw.usage, raw };
    },
  };
}
