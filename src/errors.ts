export class JevError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "JevError";
  }
}

/** Configuration problems (missing key, unknown provider, bad question). */
export class JevConfigError extends JevError {
  constructor(message: string) {
    super(message);
    this.name = "JevConfigError";
  }
}

/** Non-2xx HTTP response from a provider. */
export class JevAPIError extends JevError {
  readonly status: number;
  readonly provider: string;
  readonly body: unknown;
  readonly headers: Headers;

  constructor(provider: string, status: number, body: unknown, headers: Headers) {
    super(`[${provider}] HTTP ${status}: ${summarise(body)}`);
    this.name = "JevAPIError";
    this.provider = provider;
    this.status = status;
    this.body = body;
    this.headers = headers;
  }

  get isRateLimit(): boolean {
    return this.status === 429;
  }
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
  get isRetryable(): boolean {
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

/** Network failure (DNS, connection reset, etc). */
export class JevConnectionError extends JevError {
  constructor(provider: string, cause: unknown) {
    super(
      `[${provider}] connection error: ${cause instanceof Error ? cause.message : String(cause)}`,
      {
        cause,
      },
    );
    this.name = "JevConnectionError";
  }
}

export class JevTimeoutError extends JevError {
  constructor(provider: string, timeoutMs: number) {
    super(`[${provider}] request timed out after ${timeoutMs}ms`);
    this.name = "JevTimeoutError";
  }
}

export class JevAbortError extends JevError {
  constructor() {
    super("request aborted by caller");
    this.name = "JevAbortError";
  }
}

function summarise(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 300);
  try {
    return JSON.stringify(body).slice(0, 300);
  } catch {
    return String(body);
  }
}
