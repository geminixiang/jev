import { envApiKeyAuth } from "@earendil-works/pi-ai";
import { typesafeSystemOneApi } from "../api/typesafe-systemone.js";
import { createJevProvider } from "../provider.js";
import type { JevModel, JevProvider } from "../types.js";
import { JEV_LIST_COST, JEV_VERSIONS, jevModelId } from "./catalog.js";

export const TYPESAFE_BASE_URL = "https://api.typesafe.ai";

export const TYPESAFE_MODELS: readonly JevModel<"typesafe-systemone">[] = JEV_VERSIONS.map(
  (version) => ({
    id: jevModelId(version),
    name: `Jev ${version} (TypeSafe)`,
    api: "typesafe-systemone",
    provider: "typesafe",
    baseUrl: TYPESAFE_BASE_URL,
    slug: `jev-${version}`,
    cost: JEV_LIST_COST,
  }),
);

/** TypeSafe AI direct. Key: `TYPESAFE_API_KEY`. */
export function typesafeProvider(): JevProvider<"typesafe-systemone"> {
  return createJevProvider({
    id: "typesafe",
    name: "TypeSafe AI",
    auth: { apiKey: envApiKeyAuth("TypeSafe API key", ["TYPESAFE_API_KEY"]) },
    models: TYPESAFE_MODELS,
    api: typesafeSystemOneApi(),
  });
}
