import { envApiKeyAuth } from "@earendil-works/pi-ai";
import { openrouterDecisionsApi } from "../api/openrouter-decisions.js";
import { createJevProvider } from "../provider.js";
import type { JevModel, JevProvider } from "../types.js";
import { JEV_LIST_COST, JEV_VERSIONS, jevModelId } from "./catalog.js";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

export const OPENROUTER_MODELS: readonly JevModel<"openrouter-decisions">[] = JEV_VERSIONS.map(
  (version) => ({
    id: jevModelId(version),
    name: `Jev ${version} (OpenRouter)`,
    api: "openrouter-decisions",
    provider: "openrouter",
    baseUrl: OPENROUTER_BASE_URL,
    slug: `~typesafe/jev-${version}`,
    cost: JEV_LIST_COST,
  }),
);

/** OpenRouter Decisions API. Key: `OPENROUTER_API_KEY` (shared with pi-ai's chat provider). */
export function openrouterProvider(): JevProvider<"openrouter-decisions"> {
  return createJevProvider({
    id: "openrouter",
    name: "OpenRouter",
    auth: { apiKey: envApiKeyAuth("OpenRouter API key", ["OPENROUTER_API_KEY"]) },
    models: OPENROUTER_MODELS,
    api: openrouterDecisionsApi(),
  });
}
