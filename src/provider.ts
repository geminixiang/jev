import type { ProviderAuth } from "@earendil-works/pi-ai";
import { JevConfigError } from "./errors.js";
import type { JevApi, JevApiImpl, JevModel, JevProvider, JevProviderId } from "./types.js";

export interface CreateJevProviderOptions<TApi extends JevApi = JevApi> {
  id: JevProviderId;
  /** Display name. Default: `id`. */
  name?: string;
  /** Required — every provider has auth semantics, even keyless ones. */
  auth: ProviderAuth;
  models: readonly JevModel<TApi>[];
  /** One implementation, or a map keyed by `model.api` for mixed-API providers. */
  api: JevApiImpl<TApi> | Partial<Record<TApi, JevApiImpl<TApi>>>;
}

/**
 * Build a provider from parts. Built-in provider factories and custom
 * providers both go through this; the counterpart of pi-ai's `createProvider`.
 */
export function createJevProvider<TApi extends JevApi = JevApi>(
  input: CreateJevProviderOptions<TApi>,
): JevProvider<TApi> {
  const implFor = (api: TApi): JevApiImpl<TApi> => {
    if ("evaluate" in input.api && typeof input.api.evaluate === "function") {
      return input.api as JevApiImpl<TApi>;
    }
    const impl = (input.api as Partial<Record<TApi, JevApiImpl<TApi>>>)[api];
    if (!impl)
      throw new JevConfigError(`Provider "${input.id}" has no implementation for api "${api}".`);
    return impl;
  };
  return {
    id: input.id,
    name: input.name ?? input.id,
    auth: input.auth,
    getModels: () => input.models,
    evaluate: (model, request, options) => implFor(model.api).evaluate(model, request, options),
  };
}
