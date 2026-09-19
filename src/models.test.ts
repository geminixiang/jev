import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import {
  JevAPIError,
  JevAuthError,
  JevConfigError,
  JevTimeoutError,
  choice,
  cloudflareProvider,
  createBuiltinJevModels,
  createJevModels,
  createJevProvider,
  noul,
  openrouterProvider,
  score,
  typesafeProvider,
  vercelProvider,
} from "./index.js";
import type { Fetch, JevModel } from "./types.js";

const answers = {
  urgent: { type: "noul", noul: 0.9 },
  dept: {
    type: "choice",
    choice: "billing",
    probabilities: { billing: 0.8, tech: 0.2 },
    confidence: 0.7,
  },
  mood: {
    type: "score",
    score: 1.2,
    probabilities: { "0": 0.1, "1": 0.6, "2": 0.3 },
    legend: { "0": "calm" },
    confidence: 0.5,
  },
};
const questions = {
  urgent: noul("urgent?"),
  dept: choice("team?", { billing: null, tech: null }),
  mood: score("mood?", ["calm", "annoyed", "angry"]),
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function env(vars: Record<string, string>) {
  return { env: async (name: string) => vars[name], fileExists: async () => false };
}

describe("catalog", () => {
  it("built-in providers expose provider-neutral ids with provider-specific slugs", () => {
    const models = createBuiltinJevModels();
    expect(models.getModel("typesafe", "jev-1.13")?.slug).toBe("jev-1.13");
    expect(models.getModel("openrouter", "jev-1.13")?.slug).toBe("~typesafe/jev-1.13");
    expect(models.getModel("cloudflare", "jev-latest")?.slug).toBe("typesafe/jev");
    expect(models.getModel("vercel", "jev-latest")?.slug).toBe("typesafe-ai/jev");
    expect(models.getProviders().map((p) => p.id)).toEqual([
      "typesafe",
      "openrouter",
      "vercel",
      "cloudflare",
    ]);
  });

  it("getAvailable reflects which providers have keys", async () => {
    const models = createBuiltinJevModels({ authContext: env({ OPENROUTER_API_KEY: "or" }) });
    const available = await models.getAvailable();
    expect(new Set(available.map((m) => m.provider))).toEqual(new Set(["openrouter"]));
  });
});

describe("auth resolution", () => {
  it("env var resolves; missing key is a JevAuthError", async () => {
    const fetch = vi.fn<Fetch>(async () =>
      jsonResponse({ model: "jev-1.13.0", answers, usage: { input_tokens: 10, output_tokens: 2 } }),
    );
    const models = createBuiltinJevModels({
      authContext: env({ TYPESAFE_API_KEY: "ts-key" }),
      fetch,
    });
    const model = models.getModel("typesafe", "jev-latest") as JevModel;

    await models.evaluate(model, { state: "x", questions });
    const init = fetch.mock.calls[0]?.[1];
    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.typesafe.ai/v1/systemone");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer ts-key");
    expect(JSON.parse(init?.body as string).model).toBe("jev-latest");

    const orModel = models.getModel("openrouter", "jev-latest") as JevModel;
    await expect(models.evaluate(orModel, { state: "x", questions })).rejects.toBeInstanceOf(
      JevAuthError,
    );
  });

  it("stored credential wins over env", async () => {
    const fetch = vi.fn<Fetch>(async () => jsonResponse({ answers }));
    const credentials = new InMemoryCredentialStore();
    await credentials.modify("openrouter", async () => ({ type: "api_key", key: "stored" }));
    const models = createBuiltinJevModels({
      credentials,
      authContext: env({ OPENROUTER_API_KEY: "env" }),
      fetch,
    });
    await models.evaluate(models.getModel("openrouter", "jev-latest") as JevModel, {
      state: "x",
      questions,
    });
    expect((fetch.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe(
      "Bearer stored",
    );
  });

  it("explicit apiKey option bypasses resolution", async () => {
    const fetch = vi.fn<Fetch>(async () => jsonResponse({ answers }));
    const models = createBuiltinJevModels({ authContext: env({}), fetch });
    await models.evaluate(
      models.getModel("openrouter", "jev-latest") as JevModel,
      { state: "x", questions },
      { apiKey: "explicit" },
    );
    expect((fetch.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe(
      "Bearer explicit",
    );
  });

  it("cloudflare needs token and account id, posts {model, input} to the unified run endpoint", async () => {
    const fetch = vi.fn<Fetch>(async () =>
      jsonResponse({ success: true, result: { state: "Completed", result: { answers } } }),
    );
    const models = createBuiltinJevModels({
      authContext: env({ CLOUDFLARE_API_TOKEN: "cf", CLOUDFLARE_ACCOUNT_ID: "acct-1" }),
      fetch,
    });
    await models.evaluate(models.getModel("cloudflare", "jev-latest") as JevModel, {
      state: "x",
      questions,
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acct-1/ai/run");
    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({ model: "typesafe/jev", input: { state: "x", questions } });

    const noAccount = createBuiltinJevModels({
      authContext: env({ CLOUDFLARE_API_TOKEN: "cf" }),
      fetch,
    });
    expect(await noAccount.getAuth("cloudflare")).toBeUndefined();
  });
});

describe("responses", () => {
  it("normalises answers and usage, fills cost from the catalog", async () => {
    const fetch = vi.fn<Fetch>(async () =>
      jsonResponse({
        model: "jev-1.13.0",
        answers,
        usage: { input_tokens: 1_000_000, output_tokens: 0 },
      }),
    );
    const models = createBuiltinJevModels({ authContext: env({ OPENROUTER_API_KEY: "k" }), fetch });
    const result = await models.evaluate(models.getModel("openrouter", "jev-latest") as JevModel, {
      state: "x",
      questions,
    });

    expect(result.provider).toBe("openrouter");
    expect(result.model).toBe("jev-1.13.0");
    expect(result.answers.urgent.noul).toBe(0.9);
    expect(result.answers.dept.choice).toBe("billing");
    expect(result.answers.dept.probabilities.tech).toBe(0.2);
    expect(result.answers.mood.legend).toEqual({ "0": "calm" });
    expect(result.usage).toEqual({
      input: 1_000_000,
      output: 0,
      totalTokens: 1_000_000,
      cost: { input: 0.042, output: 0, total: 0.042 },
    });
  });

  it("prefers the backend's reported cost when present", async () => {
    const fetch = vi.fn<Fetch>(async () =>
      jsonResponse({ answers, usage: { input_tokens: 10, output_tokens: 1, cost: 0.0005 } }),
    );
    const models = createBuiltinJevModels({ authContext: env({ OPENROUTER_API_KEY: "k" }), fetch });
    const result = await models.evaluate(models.getModel("openrouter", "jev-latest") as JevModel, {
      state: "x",
      questions,
    });
    expect(result.usage.cost.total).toBe(0.0005);
  });

  it("rejects a response missing an answer", async () => {
    const fetch = vi.fn<Fetch>(async () => jsonResponse({ answers: { urgent: answers.urgent } }));
    const models = createBuiltinJevModels({ authContext: env({ OPENROUTER_API_KEY: "k" }), fetch });
    await expect(
      models.evaluate(models.getModel("openrouter", "jev-latest") as JevModel, {
        state: "x",
        questions,
      }),
    ).rejects.toThrow('missing answer for "dept"');
  });

  it("cloudflare envelope failure becomes a JevAPIError", async () => {
    const fetch = vi.fn<Fetch>(async () =>
      jsonResponse({ success: false, errors: [{ message: "nope" }] }),
    );
    const models = createBuiltinJevModels({
      authContext: env({ CLOUDFLARE_API_TOKEN: "cf", CLOUDFLARE_ACCOUNT_ID: "a" }),
      fetch,
    });
    await expect(
      models.evaluate(models.getModel("cloudflare", "jev-latest") as JevModel, {
        state: "x",
        questions,
      }),
    ).rejects.toBeInstanceOf(JevAPIError);
  });
});

describe("errors and retries", () => {
  it("retries 429 honouring retry-after, then succeeds", async () => {
    const fetch = vi
      .fn<Fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "slow down" }, 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse({ answers }));
    const models = createBuiltinJevModels({
      authContext: env({ OPENROUTER_API_KEY: "k" }),
      fetch,
      maxRetries: 2,
    });
    const result = await models.evaluate(models.getModel("openrouter", "jev-latest") as JevModel, {
      state: "x",
      questions,
    });
    expect(result.answers.urgent.noul).toBe(0.9);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry 400", async () => {
    const fetch = vi.fn<Fetch>(async () => jsonResponse({ error: { message: "bad" } }, 400));
    const models = createBuiltinJevModels({ authContext: env({ OPENROUTER_API_KEY: "k" }), fetch });
    await expect(
      models.evaluate(models.getModel("openrouter", "jev-latest") as JevModel, {
        state: "x",
        questions,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("times out", async () => {
    const fetch = vi.fn<Fetch>(
      (_url, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    );
    const models = createBuiltinJevModels({
      authContext: env({ OPENROUTER_API_KEY: "k" }),
      fetch,
      maxRetries: 0,
      timeoutMs: 10,
    });
    await expect(
      models.evaluate(models.getModel("openrouter", "jev-latest") as JevModel, {
        state: "x",
        questions,
      }),
    ).rejects.toBeInstanceOf(JevTimeoutError);
  });

  it("validates questions before any request", async () => {
    const fetch = vi.fn<Fetch>();
    const models = createBuiltinJevModels({ authContext: env({ OPENROUTER_API_KEY: "k" }), fetch });
    const model = models.getModel("openrouter", "jev-latest") as JevModel;
    await expect(models.evaluate(model, { state: "x", questions: {} })).rejects.toBeInstanceOf(
      JevConfigError,
    );
    await expect(
      models.evaluate(model, {
        state: "x",
        questions: { q: { type: "choice", criteria: { only: null } } },
      }),
    ).rejects.toThrow("at least 2 options");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("custom providers", () => {
  it("createJevProvider wires a custom api impl and auth", async () => {
    const evaluate = vi.fn(async () => ({
      provider: "mine",
      model: "m",
      answers: {} as never,
      usage: { input: 0, output: 0, totalTokens: 0, cost: { input: 0, output: 0, total: 0 } },
      raw: null,
    }));
    const provider = createJevProvider({
      id: "mine",
      auth: { apiKey: { name: "none", resolve: async () => ({ auth: {} }) } },
      models: [
        {
          id: "jev-latest",
          name: "mine",
          api: "custom",
          provider: "mine",
          baseUrl: "http://x",
          slug: "s",
          cost: { input: 0, output: 0 },
        },
      ],
      api: { api: "custom", evaluate },
    });
    const models = createJevModels();
    models.setProvider(provider);
    await models.evaluate(models.getModel("mine", "jev-latest") as JevModel, {
      state: "x",
      questions: { q: noul("?") },
    });
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it("built-in factories are independently constructible", () => {
    expect(typesafeProvider().id).toBe("typesafe");
    expect(openrouterProvider().id).toBe("openrouter");
    expect(cloudflareProvider().id).toBe("cloudflare");
    expect(vercelProvider().id).toBe("vercel");
  });
});

describe("vercel provider", () => {
  it("sends gateway headers, boolean-named noul questions, and reads confidence from providerMetadata", async () => {
    const fetch = vi.fn<Fetch>(async () =>
      jsonResponse({
        answers: {
          urgent: { type: "boolean", probability: 0.9 },
          dept: { type: "choice", choice: "billing", probabilities: { billing: 0.8, tech: 0.2 } },
          mood: { type: "score", score: 1.2, probabilities: { "0": 0.1, "1": 0.6, "2": 0.3 } },
        },
        usage: { inputTokens: 350, outputTokens: 61 },
        providerMetadata: { typesafe: { confidence: { dept: 1, mood: 0.64 } } },
      }),
    );
    const models = createBuiltinJevModels({
      authContext: env({ AI_GATEWAY_API_KEY: "vk" }),
      fetch,
    });
    const result = await models.evaluate(models.getModel("vercel", "jev-latest") as JevModel, {
      state: "x",
      questions,
    });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://ai-gateway.vercel.sh/v4/ai/evaluation-model");
    const headers = init?.headers as Record<string, string>;
    expect(headers["ai-gateway-protocol-version"]).toBe("0.0.1");
    expect(headers["ai-evaluation-model-specification-version"]).toBe("4");
    expect(headers["ai-model-id"]).toBe("typesafe-ai/jev");
    expect(headers.Authorization).toBe("Bearer vk");
    expect(JSON.parse(init?.body as string).questions.urgent.type).toBe("boolean");

    expect(result.answers.urgent.noul).toBe(0.9);
    expect(result.answers.dept.confidence).toBe(1);
    expect(result.answers.mood.confidence).toBe(0.64);
    expect(result.usage.input).toBe(350);
  });

  it("falls back to VERCEL_API_KEY when AI_GATEWAY_API_KEY is unset", async () => {
    const fetch = vi.fn<Fetch>(async () =>
      jsonResponse({ answers: { urgent: { type: "boolean", probability: 0.5 } } }),
    );
    const models = createBuiltinJevModels({
      authContext: env({ VERCEL_API_KEY: "legacy" }),
      fetch,
    });
    await models.evaluate(models.getModel("vercel", "jev-latest") as JevModel, {
      state: "x",
      questions: { urgent: noul("?") },
    });
    expect((fetch.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe(
      "Bearer legacy",
    );
  });
});
