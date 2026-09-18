import { describe, expect, it, vi } from "vitest";
import {
  JevAPIError,
  JevAbortError,
  JevClient,
  JevConfigError,
  JevConnectionError,
  JevTimeoutError,
  cloudflareBindingProvider,
  noul,
} from "./index.js";
import type { JevProvider } from "./types.js";

const questions = { q: noul("is it?") };
const answers = { q: { type: "noul", noul: 0.5 } } as const;
const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, ...(headers ? { headers } : {}) });

describe("openrouter headers", () => {
  it("sends ranking headers and user agent", async () => {
    const fetch = vi.fn((_url: string, init?: RequestInit) => {
      const h = init?.headers as Record<string, string>;
      expect(h["HTTP-Referer"]).toBe("https://x.dev");
      expect(h["X-OpenRouter-Title"]).toBe("X");
      expect(h["User-Agent"]).toMatch(/^jev-sdk\//);
      expect(h["X-Custom"]).toBe("1");
      return Promise.resolve(json({ answers }));
    });
    const client = new JevClient("openrouter", {
      apiKey: "k",
      fetch,
      siteUrl: "https://x.dev",
      siteName: "X",
    });
    await client.evaluate({ state: "s", questions }, { headers: { "X-Custom": "1" } });
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("cloudflare", () => {
  it("requires accountId for REST", () => {
    expect(() => new JevClient("cloudflare", { apiKey: "k" })).toThrow(JevConfigError);
  });

  it("surfaces success:false as JevAPIError", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(json({ success: false, errors: [{ code: 1, message: "nope" }] })),
    );
    const client = new JevClient("cloudflare", {
      apiKey: "k",
      accountId: "a",
      fetch,
      retry: { maxRetries: 0 },
    });
    await expect(client.evaluate({ state: "s", questions })).rejects.toBeInstanceOf(JevAPIError);
  });

  it("binding provider calls env.AI.run", async () => {
    const run = vi.fn(() => Promise.resolve({ model: "jev-1.13.0", answers }));
    const client = new JevClient(cloudflareBindingProvider({ binding: { run } }));
    const res = await client.evaluate({ state: "s", questions });
    expect(run).toHaveBeenCalledWith("typesafe/jev", { state: "s", questions });
    expect(res.provider).toBe("cloudflare-binding");
    expect(res.answers.q.noul).toBe(0.5);
  });
});

describe("transport failures", () => {
  it("wraps network errors and retries them", async () => {
    let n = 0;
    const fetch = vi.fn(() =>
      n++ === 0 ? Promise.reject(new TypeError("ECONNRESET")) : Promise.resolve(json({ answers })),
    );
    const client = new JevClient("typesafe", { apiKey: "k", fetch, retry: { initialDelayMs: 1 } });
    await client.evaluate({ state: "s", questions });
    expect(n).toBe(2);
  });

  it("gives up after maxRetries with JevConnectionError", async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError("down")));
    const client = new JevClient("typesafe", {
      apiKey: "k",
      fetch,
      retry: { maxRetries: 1, initialDelayMs: 1 },
    });
    await expect(client.evaluate({ state: "s", questions })).rejects.toBeInstanceOf(
      JevConnectionError,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("times out", async () => {
    const fetch = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const client = new JevClient("typesafe", {
      apiKey: "k",
      fetch,
      timeoutMs: 10,
      retry: { maxRetries: 0 },
    });
    await expect(client.evaluate({ state: "s", questions })).rejects.toBeInstanceOf(
      JevTimeoutError,
    );
  });

  it("honours caller abort without retrying", async () => {
    const fetch = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const ac = new AbortController();
    const client = new JevClient("typesafe", { apiKey: "k", fetch });
    const p = client.evaluate({ state: "s", questions }, { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toBeInstanceOf(JevAbortError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("honours Retry-After on 429", async () => {
    let n = 0;
    const t0 = Date.now();
    const fetch = vi.fn(() =>
      Promise.resolve(n++ === 0 ? json({}, 429, { "retry-after": "0.05" }) : json({ answers })),
    );
    const client = new JevClient("typesafe", { apiKey: "k", fetch });
    await client.evaluate({ state: "s", questions });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(40);
  });

  it("exposes error metadata", async () => {
    const fetch = vi.fn(() => Promise.resolve(json({ error: "unauthorized" }, 401)));
    const client = new JevClient("openrouter", { apiKey: "k", fetch });
    const err = await client.evaluate({ state: "s", questions }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JevAPIError);
    const e = err as JevAPIError;
    expect(e.status).toBe(401);
    expect(e.isAuth).toBe(true);
    expect(e.isRetryable).toBe(false);
    expect(e.provider).toBe("openrouter");
    expect(e.body).toEqual({ error: "unauthorized" });
  });
});

describe("custom provider", () => {
  it("is used verbatim", async () => {
    const custom: JevProvider = {
      name: "custom",
      evaluate: async () => ({ provider: "custom", answers }),
    };
    const res = await new JevClient(custom).evaluate({ state: "s", questions });
    expect(res.provider).toBe("custom");
  });
});
