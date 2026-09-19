import type { ApiKeyAuth } from "@earendil-works/pi-ai";
import { djevSystemOneApi } from "../api/djev-systemone.js";
import { createJevProvider } from "../provider.js";
import type { JevModel, JevProvider } from "../types.js";

export interface DjevProviderOptions {
  /** The structured server, e.g. "http://spark:8011". Overridable per env with `DJEV_BASE_URL`. */
  baseUrl?: string;
  /** Provider id when you run several boxes. Default "djev". */
  id?: string;
  /** Display name. Default derives from `id`. */
  name?: string;
  /**
   * Explicit key for a server started with `API_KEY`. Left unset, the env
   * var `DJEV_API_KEY` (or a stored credential for `id`) is used when
   * present; the server is keyless by default, so no key is not an error.
   */
  apiKey?: string;
  /** Model id in the catalog. Default "jev-latest"; the server ignores it on the wire. */
  modelId?: string;
}

/** Default endpoint: the structured server's port on the local box. */
export const DJEV_BASE_URL = "http://127.0.0.1:8011";

/**
 * Keyless-friendly auth: always resolves, since the server needs a bearer
 * token only when started with `API_KEY`. Order: explicit option, stored
 * credential, `DJEV_API_KEY`. `DJEV_BASE_URL` in the env overrides the
 * configured endpoint.
 */
function djevAuth(explicitKey?: string): ApiKeyAuth {
  return {
    name: "djev-spark key (optional)",
    async resolve({ ctx, credential }) {
      const key = explicitKey ?? credential?.key ?? (await ctx.env("DJEV_API_KEY"));
      const baseUrl = await ctx.env("DJEV_BASE_URL");
      return {
        auth: { ...(key ? { apiKey: key } : {}), ...(baseUrl ? { baseUrl } : {}) },
        source: explicitKey ? "option" : key ? "DJEV_API_KEY" : "keyless",
      };
    },
  };
}

/**
 * A self-hosted djev-spark box (https://github.com/geminixiang/djev-spark):
 * DiffusionGemma serving TypeSafe's `/v1/systemone` protocol plus the
 * server's extensions (seed, samples, think, images, question dependencies).
 *
 * Point it at your box and register it:
 *
 * ```ts
 * const models = createJevModels();
 * models.setProvider(djevProvider({ baseUrl: "http://spark:8011" }));
 * const model = models.getModel("djev", "jev-latest")!;
 * ```
 *
 * Not a builtin: a self-hosted endpoint has no fixed address, so it is
 * created explicitly, like pi-ai's custom providers.
 */
export function djevProvider(options: DjevProviderOptions = {}): JevProvider<"djev-systemone"> {
  const id = options.id ?? "djev";
  const models: readonly JevModel<"djev-systemone">[] = [
    {
      id: options.modelId ?? "jev-latest",
      name: options.name ?? `Jev (${id}, self-hosted)`,
      api: "djev-systemone",
      provider: id,
      baseUrl: options.baseUrl ?? DJEV_BASE_URL,
      // The server accepts and ignores `model`.
      slug: options.modelId ?? "jev-latest",
      cost: { input: 0, output: 0 },
    },
  ];
  return createJevProvider({
    id,
    name: options.name ?? "djev-spark (self-hosted)",
    auth: { apiKey: djevAuth(options.apiKey) },
    models,
    api: djevSystemOneApi(),
  });
}
