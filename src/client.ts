import { JEV_API_KEY_ENV, type ProviderName, readApiKeyFromEnv } from "./env.js";
import {
  JevAPIError,
  JevAbortError,
  JevConfigError,
  JevConnectionError,
  JevTimeoutError,
} from "./errors.js";
import { cloudflareProvider } from "./providers/cloudflare.js";
import { openrouterProvider } from "./providers/openrouter.js";
import { typesafeProvider } from "./providers/typesafe.js";
import { validateQuestions } from "./questions.js";
import type {
  EvaluateOptions,
  Fetch,
  JevProvider,
  JevRequest,
  JevResponse,
  JevState,
  Questions,
} from "./types.js";
import { VERSION } from "./version.js";

export interface RetryOptions {
  /** Default 2 */
  maxRetries?: number;
  /** Default 500ms */
  initialDelayMs?: number;
  /** Default 8000ms */
  maxDelayMs?: number;
}

export interface JevClientOptions {
  /** Falls back to JEV_API_KEY. */
  apiKey?: string;
  /** Overrides the provider's default base URL. */
  baseUrl?: string;
  /** Default "jev-latest". */
  model?: string;
  /** Cloudflare REST only. */
  accountId?: string;
  /** Default 30_000. */
  timeoutMs?: number;
  retry?: RetryOptions;
  /** Headers sent with every request. */
  headers?: Record<string, string>;
  fetch?: Fetch;
  /**
   * By default the client refuses to run in a browser, since that leaks your
   * API key. Set to true only if you understand the risk.
   */
  dangerouslyAllowBrowser?: boolean;
  /** OpenRouter ranking headers. */
  siteUrl?: string;
  siteName?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Detect a browser main thread, where an API key would be exposed to end users. */
const isBrowser = (): boolean =>
  typeof (globalThis as { window?: unknown }).window !== "undefined" &&
  typeof (globalThis as { document?: unknown }).document !== "undefined";

export class JevClient {
  readonly provider: JevProvider;
  readonly model: string;
  readonly timeoutMs: number;
  readonly #retry: Required<RetryOptions>;
  readonly #headers: Record<string, string>;
  readonly #fetch: Fetch;

  /**
   * @param provider  "typesafe" | "openrouter" | "cloudflare", or a custom JevProvider.
   * @param options   API key etc. Key falls back to JEV_API_KEY for every provider.
   */
  constructor(provider: ProviderName | JevProvider, options: JevClientOptions = {}) {
    if (isBrowser() && !options.dangerouslyAllowBrowser && typeof provider === "string") {
      throw new JevConfigError(
        "JevClient is running in a browser, which would expose your API key. " +
          "Call Jev from a server, or pass `dangerouslyAllowBrowser: true`.",
      );
    }
    this.provider = resolveProvider(provider, options);
    this.model = options.model ?? "jev-latest";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#retry = {
      maxRetries: options.retry?.maxRetries ?? 2,
      initialDelayMs: options.retry?.initialDelayMs ?? 500,
      maxDelayMs: options.retry?.maxDelayMs ?? 8_000,
    };
    this.#headers = { "User-Agent": `jev-sdk/${VERSION}`, ...options.headers };
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    if (!options.fetch && typeof globalThis.fetch !== "function") {
      throw new JevConfigError("No global fetch available; pass `fetch` to JevClient.");
    }
  }

  /**
   * Ask Jev typed questions about a state. Answers are typed by question name.
   */
  async evaluate<Qs extends Questions>(
    request: JevRequest<Qs>,
    options: EvaluateOptions = {},
  ): Promise<JevResponse<Qs>> {
    validateQuestions(request.questions);
    const req: JevRequest = { ...request, model: request.model ?? this.model };
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;

    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const onAbort = () => controller.abort(new JevAbortError());
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) onAbort();
      const timer = setTimeout(
        () => controller.abort(new JevTimeoutError(this.provider.name, timeoutMs)),
        timeoutMs,
      );

      try {
        const res = await this.provider.evaluate(req, {
          signal: controller.signal,
          headers: { ...this.#headers, ...options.headers },
          fetch: this.#fetch,
        });
        return res as JevResponse<Qs>;
      } catch (err) {
        if (err instanceof JevAbortError || options.signal?.aborted) throw err;
        if (attempt >= this.#retry.maxRetries || !isRetryable(err)) throw err;
        attempt++;
        await sleep(this.#backoff(attempt, err));
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
      }
    }
  }

  /** Convenience: evaluate one question and return only its answer. */
  async ask<Q extends Questions[string]>(state: JevState, question: Q, options?: EvaluateOptions) {
    const res = await this.evaluate({ state, questions: { q: question } }, options);
    return res.answers.q;
  }

  #backoff(attempt: number, err: unknown): number {
    if (err instanceof JevAPIError) {
      const ra = err.headers.get("retry-after");
      const sec = ra ? Number(ra) : Number.NaN;
      if (Number.isFinite(sec) && sec > 0) return Math.min(sec * 1000, this.#retry.maxDelayMs);
    }
    const base = Math.min(this.#retry.initialDelayMs * 2 ** (attempt - 1), this.#retry.maxDelayMs);
    return base * (0.75 + Math.random() * 0.5);
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof JevAPIError) return err.isRetryable;
  return err instanceof JevConnectionError || err instanceof JevTimeoutError;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function resolveProvider(name: ProviderName | JevProvider, options: JevClientOptions): JevProvider {
  if (typeof name === "object") return name;
  if (name !== "typesafe" && name !== "openrouter" && name !== "cloudflare") {
    throw new JevConfigError(
      `Unknown provider "${String(name)}". Expected typesafe | openrouter | cloudflare, or a JevProvider instance.`,
    );
  }

  const apiKey = options.apiKey ?? readApiKeyFromEnv();
  if (!apiKey) {
    throw new JevConfigError(
      `No API key. Pass \`apiKey\` to JevClient or set ${JEV_API_KEY_ENV} (provider: ${name}).`,
    );
  }
  const baseUrl = options.baseUrl;

  switch (name) {
    case "typesafe":
      return typesafeProvider(baseUrl ? { apiKey, baseUrl } : { apiKey });
    case "openrouter":
      return openrouterProvider({
        apiKey,
        ...(baseUrl ? { baseUrl } : {}),
        ...(options.siteUrl ? { siteUrl: options.siteUrl } : {}),
        ...(options.siteName ? { siteName: options.siteName } : {}),
      });
    case "cloudflare": {
      const accountId = options.accountId;
      if (!accountId) {
        throw new JevConfigError("Cloudflare provider needs `accountId`.");
      }
      return cloudflareProvider({ apiKey, accountId, ...(baseUrl ? { baseUrl } : {}) });
    }
  }
}
