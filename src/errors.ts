export class JevError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "JevError";
  }
}

/** Malformed request, unknown provider/model, missing implementation. */
export class JevConfigError extends JevError {
  constructor(message: string) {
    super(message);
    this.name = "JevConfigError";
  }
}

/** The provider has no usable credential. */
export class JevAuthError extends JevError {
  readonly provider: string;
  constructor(provider: string, message: string) {
    super(message);
    this.name = "JevAuthError";
    this.provider = provider;
  }
}

/** Non-2xx HTTP response, or a 2xx envelope that reports failure. */
export class JevAPIError extends JevError {
  readonly provider: string;
  readonly status: number;
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

/** A 2xx body that does not match the expected answer shape. Not retried. */
export class JevResponseError extends JevError {
  readonly provider: string;
  readonly body: unknown;
  constructor(provider: string, message: string, body: unknown) {
    super(`[${provider}] ${message}`);
    this.name = "JevResponseError";
    this.provider = provider;
    this.body = body;
  }
}

export class JevConnectionError extends JevError {
  readonly provider: string;
  constructor(provider: string, cause: unknown) {
    super(
      `[${provider}] connection error: ${cause instanceof Error ? cause.message : String(cause)}`,
      {
        cause,
      },
    );
    this.name = "JevConnectionError";
    this.provider = provider;
  }
}

export class JevTimeoutError extends JevError {
  readonly provider: string;
  constructor(provider: string, timeoutMs: number) {
    super(`[${provider}] request timed out after ${timeoutMs}ms`);
    this.name = "JevTimeoutError";
    this.provider = provider;
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
