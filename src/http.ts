import { JevAPIError, JevAbortError, JevConnectionError } from "./errors.js";
import type { ResolvedEvaluateOptions } from "./types.js";

/**
 * POST JSON and parse JSON back. Throws JevAPIError on non-2xx,
 * JevConnectionError on network failure, JevAbortError on abort.
 * Timeout is handled by the caller via the signal (see client.ts).
 */
export async function postJson<T = unknown>(
  provider: string,
  url: string,
  body: unknown,
  options: ResolvedEvaluateOptions,
): Promise<T> {
  let response: Response;
  try {
    response = await options.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...options.headers },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    if (options.signal.aborted) throw options.signal.reason ?? new JevAbortError();
    throw new JevConnectionError(provider, err);
  }

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }

  if (!response.ok) throw new JevAPIError(provider, response.status, parsed, response.headers);
  return parsed as T;
}
