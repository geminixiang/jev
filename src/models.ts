import {
  type AuthContext,
  type AuthResult,
  type CredentialStore,
  InMemoryCredentialStore,
  defaultProviderAuthContext,
} from "@earendil-works/pi-ai";
import {
  JevAPIError,
  JevAbortError,
  JevAuthError,
  JevConfigError,
  JevConnectionError,
  JevTimeoutError,
} from "./errors.js";
import { builtinJevProviders } from "./providers/all.js";
import { validateQuestions } from "./questions.js";
import type {
  EvaluateOptions,
  Fetch,
  JevModel,
  JevModels,
  JevProvider,
  JevRequest,
  JevResult,
  MutableJevModels,
  Questions,
} from "./types.js";

export interface CreateJevModelsOptions {
  /** App-owned credential storage; defaults to in-memory. Share pi-ai's store to reuse logins. */
  credentials?: CredentialStore;
  /** Env / file access; defaults to process.env. */
  authContext?: AuthContext;
  fetch?: Fetch;
  /** Default 30_000. */
  timeoutMs?: number;
  /** Default 2. */
  maxRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const BACKOFF_INITIAL_MS = 500;
const BACKOFF_MAX_MS = 8_000;

class JevModelsImpl implements MutableJevModels {
  readonly #providers = new Map<string, JevProvider>();
  readonly #credentials: CredentialStore;
  readonly #authContext: AuthContext;
  readonly #fetch: Fetch;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;

  constructor(options: CreateJevModelsOptions) {
    this.#credentials = options.credentials ?? new InMemoryCredentialStore();
    this.#authContext = options.authContext ?? defaultProviderAuthContext();
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  setProvider(provider: JevProvider): void {
    this.#providers.set(provider.id, provider);
  }
  deleteProvider(id: string): void {
    this.#providers.delete(id);
  }
  clearProviders(): void {
    this.#providers.clear();
  }
  getProviders(): readonly JevProvider[] {
    return [...this.#providers.values()];
  }
  getProvider(id: string): JevProvider | undefined {
    return this.#providers.get(id);
  }

  getModels(provider?: string): readonly JevModel[] {
    const entries =
      provider === undefined ? [...this.#providers.values()] : [this.#providers.get(provider)];
    const models: JevModel[] = [];
    for (const entry of entries) {
      if (!entry) continue;
      try {
        models.push(...entry.getModels());
      } catch {
        // Best-effort: an ill-behaved provider yields no models.
      }
    }
    return models;
  }

  getModel(provider: string, id: string): JevModel | undefined {
    return this.getModels(provider).find((model) => model.id === id);
  }

  async getAuth(providerOrModel: string | JevModel): Promise<AuthResult | undefined> {
    const providerId =
      typeof providerOrModel === "string" ? providerOrModel : providerOrModel.provider;
    const provider = this.#providers.get(providerId);
    if (!provider?.auth.apiKey) return undefined;
    const stored = await this.#credentials.read(providerId);
    const credential = stored?.type === "api_key" ? stored : undefined;
    return provider.auth.apiKey.resolve({
      ctx: this.#authContext,
      ...(credential ? { credential } : {}),
      signal: new AbortController().signal,
    });
  }

  async getAvailable(providerId?: string): Promise<readonly JevModel[]> {
    const ids = providerId === undefined ? [...this.#providers.keys()] : [providerId];
    const available: JevModel[] = [];
    for (const id of ids) {
      if (await this.getAuth(id)) available.push(...this.getModels(id));
    }
    return available;
  }

  async evaluate<Qs extends Questions>(
    model: JevModel,
    request: JevRequest<Qs>,
    options: EvaluateOptions = {},
  ): Promise<JevResult<Qs>> {
    validateQuestions(request.questions);
    const provider = this.#providers.get(model.provider);
    if (!provider) throw new JevConfigError(`Unknown provider "${model.provider}".`);

    const resolution = options.apiKey !== undefined ? undefined : await this.getAuth(model);
    const apiKey = options.apiKey ?? resolution?.auth.apiKey;
    if (!apiKey && options.apiKey === undefined && !resolution) {
      throw new JevAuthError(
        model.provider,
        `Provider "${model.provider}" is not configured (${provider.auth.apiKey?.name ?? "no auth"}).`,
      );
    }
    const requestModel = resolution?.auth.baseUrl
      ? { ...model, baseUrl: resolution.auth.baseUrl }
      : model;
    const env = { ...resolution?.env, ...options.env };
    const headers = dropNulls({
      ...resolution?.auth.headers,
      ...model.headers,
      ...options.headers,
    });
    const fetch = options.fetch ?? this.#fetch;
    const timeoutMs = options.timeoutMs ?? this.#timeoutMs;
    const maxRetries = options.maxRetries ?? this.#maxRetries;

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const onAbort = () => controller.abort(new JevAbortError());
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) onAbort();
      const timer = setTimeout(
        () => controller.abort(new JevTimeoutError(model.provider, timeoutMs)),
        timeoutMs,
      );
      try {
        const result = await provider.evaluate(requestModel, request, {
          ...(apiKey ? { apiKey } : {}),
          env,
          headers,
          signal: controller.signal,
          fetch,
        });
        return result as JevResult<Qs>;
      } catch (err) {
        if (err instanceof JevAbortError || options.signal?.aborted) throw err;
        if (attempt >= maxRetries || !isRetryable(err)) throw err;
        await sleep(backoff(attempt + 1, err));
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
      }
    }
  }
}

function dropNulls(headers: Record<string, string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof JevAPIError) return err.isRetryable;
  return err instanceof JevConnectionError || err instanceof JevTimeoutError;
}

function backoff(attempt: number, err: unknown): number {
  if (err instanceof JevAPIError) {
    const retryAfter = Number(err.headers.get("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0)
      return Math.min(retryAfter * 1000, BACKOFF_MAX_MS);
  }
  const base = Math.min(BACKOFF_INITIAL_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
  return base * (0.75 + Math.random() * 0.5);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Create an empty collection; register providers with `setProvider`. */
export function createJevModels(options: CreateJevModelsOptions = {}): MutableJevModels {
  return new JevModelsImpl(options);
}

/** Collection pre-loaded with every built-in provider. */
export function createBuiltinJevModels(options: CreateJevModelsOptions = {}): MutableJevModels {
  const models = createJevModels(options);
  for (const provider of builtinJevProviders()) models.setProvider(provider);
  return models;
}

export type { JevModels };
