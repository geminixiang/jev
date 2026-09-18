/** The only environment variable the SDK reads. Shared by every provider. */
export const JEV_API_KEY_ENV = "JEV_API_KEY";

export function readApiKeyFromEnv(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const v = env?.[JEV_API_KEY_ENV]?.trim();
  return v ? v : undefined;
}

export type ProviderName = "typesafe" | "openrouter" | "cloudflare";
