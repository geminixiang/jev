import { envApiKeyAuth } from "@earendil-works/pi-ai";
import { vercelEvaluationApi } from "../api/vercel-evaluation.js";
import { createJevProvider } from "../provider.js";
import type { JevModel, JevProvider } from "../types.js";
import { JEV_LIST_COST } from "./catalog.js";

export const VERCEL_BASE_URL = "https://ai-gateway.vercel.sh/v4/ai";

/** The Gateway exposes one unversioned Jev slug today. */
export const VERCEL_MODELS: readonly JevModel<"vercel-evaluation">[] = [
  {
    id: "jev-latest",
    name: "Jev (Vercel AI Gateway)",
    api: "vercel-evaluation",
    provider: "vercel",
    baseUrl: VERCEL_BASE_URL,
    slug: "typesafe-ai/jev",
    cost: JEV_LIST_COST,
  },
];

/** Vercel AI Gateway. Key: `AI_GATEWAY_API_KEY` (falls back to `VERCEL_API_KEY`). */
export function vercelProvider(): JevProvider<"vercel-evaluation"> {
  return createJevProvider({
    id: "vercel",
    name: "Vercel AI Gateway",
    auth: {
      apiKey: envApiKeyAuth("Vercel AI Gateway key", ["AI_GATEWAY_API_KEY", "VERCEL_API_KEY"]),
    },
    models: VERCEL_MODELS,
    api: vercelEvaluationApi(),
  });
}
