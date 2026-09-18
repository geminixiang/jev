import { afterEach, describe, expect, it, vi } from "vitest";
import { JevAPIError, JevClient, JevConfigError, choice, noul, score } from "./index.js";

const answers = {
  is_urgent: { type: "noul", noul: 0.95 },
  department: {
    type: "choice",
    choice: "billing",
    confidence: 0.8,
    probabilities: { billing: 0.87, sales: 0, technical: 0.13 },
  },
  frustration: {
    type: "score",
    score: 1.04,
    confidence: 0.94,
    legend: { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
    probabilities: { "0": 0, "1": 0.96, "2": 0.04 },
  },
};

const questions = {
  is_urgent: noul("Does this convey urgency?"),
  department: choice("Which team?", { billing: "Payments", technical: "Bugs", sales: null }),
  frustration: score("How frustrated?", ["Calm", "Frustrated", "Very angry"]),
};

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(handler) as unknown as typeof fetch;
}
const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

afterEach(() => {
  // biome-ignore lint/performance/noDelete: must actually unset the var for the "no key" test
  delete process.env.JEV_API_KEY;
});

describe("providers share JEV_API_KEY", () => {
  it("throws without a key", () => {
    expect(() => new JevClient("typesafe")).toThrow(JevConfigError);
  });

  it("throws on unknown provider", () => {
    expect(() => new JevClient("nope" as never, { apiKey: "k" })).toThrow(JevConfigError);
  });

  it("openrouter", async () => {
    process.env.JEV_API_KEY = "sk-or-v1-abc";
    const fetch = mockFetch((url, init) => {
      expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-v1-abc");
      expect(JSON.parse(init.body as string).model).toBe("~typesafe/jev-latest");
      return json({ model: "jev-1.13.0", answers });
    });
    const client = new JevClient("openrouter", { fetch });
    const res = await client.evaluate({ state: "hi", questions });
    expect(res.provider).toBe("openrouter");
    expect(res.answers.department.choice).toBe("billing");
  });

  it("typesafe maps the model", async () => {
    process.env.JEV_API_KEY = "ts_key";
    const fetch = mockFetch((url, init) => {
      expect(url).toBe("https://api.typesafe.ai/v1/systemone");
      expect(JSON.parse(init.body as string).model).toBe("jev-1.13");
      return json({ model: "jev-1.13.0", answers });
    });
    const res = await new JevClient("typesafe", { fetch, model: "~typesafe/jev-1.13" }).evaluate({
      state: "hi",
      questions,
    });
    expect(res.provider).toBe("typesafe");
    expect(res.answers.frustration.score).toBeCloseTo(1.04);
  });

  it("cloudflare uses accountId and unwraps envelope", async () => {
    process.env.JEV_API_KEY = "cf_token";
    const fetch = mockFetch((url) => {
      expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acc123/ai/run/typesafe/jev");
      return json({ success: true, result: { model: "jev-1.13.0", answers } });
    });
    const res = await new JevClient("cloudflare", { fetch, accountId: "acc123" }).evaluate({
      state: "hi",
      questions,
    });
    expect(res.provider).toBe("cloudflare");
    expect(res.answers.is_urgent.noul).toBe(0.95);
  });
});

describe("errors & retries", () => {
  it("retries 5xx then succeeds", async () => {
    let n = 0;
    const fetch = mockFetch(() => (n++ === 0 ? json({ error: "boom" }, 503) : json({ answers })));
    const client = new JevClient("typesafe", { apiKey: "k", fetch, retry: { initialDelayMs: 1 } });
    const res = await client.evaluate({ state: "s", questions });
    expect(n).toBe(2);
    expect(res.answers.is_urgent.noul).toBe(0.95);
  });

  it("does not retry 4xx", async () => {
    const fetch = mockFetch(() => json({ error: "bad" }, 400));
    const client = new JevClient("typesafe", { apiKey: "k", fetch });
    await expect(client.evaluate({ state: "s", questions })).rejects.toBeInstanceOf(JevAPIError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("validates questions", async () => {
    const client = new JevClient("typesafe", { apiKey: "k", fetch: mockFetch(() => json({})) });
    await expect(
      client.evaluate({
        state: "s",
        questions: { x: { type: "choice", criteria: { only: null } } },
      }),
    ).rejects.toBeInstanceOf(JevConfigError);
  });
});

describe("ask()", () => {
  it("returns a single typed answer", async () => {
    const fetch = mockFetch(() => json({ answers: { q: answers.department } }));
    const a = await new JevClient("typesafe", { apiKey: "k", fetch }).ask(
      "s",
      questions.department,
    );
    expect(a.choice).toBe("billing");
    expect(a.probabilities.technical).toBe(0.13);
  });
});
