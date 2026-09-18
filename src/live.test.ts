/**
 * Live smoke test against real providers. Opt-in:
 *
 *   JEV_API_KEY=... JEV_LIVE_PROVIDER=openrouter npm run test:live
 *   JEV_API_KEY=... JEV_LIVE_PROVIDER=cloudflare JEV_LIVE_ACCOUNT_ID=... npm run test:live
 */
import { describe, expect, it } from "vitest";
import { JevClient, choice, noul, score } from "./index.js";
import type { ProviderName } from "./index.js";

const provider = (process.env.JEV_LIVE_PROVIDER ?? "typesafe") as ProviderName;
const enabled = process.env.JEV_LIVE === "1" && !!process.env.JEV_API_KEY;

describe.skipIf(!enabled)(`live: ${provider}`, () => {
  it("answers the canonical support-ticket example", async () => {
    const client = new JevClient(provider, {
      ...(process.env.JEV_LIVE_ACCOUNT_ID ? { accountId: process.env.JEV_LIVE_ACCOUNT_ID } : {}),
    });
    const { answers, model, usage } = await client.evaluate({
      state: "Help! My payouts have been failing for 3 days.",
      questions: {
        is_urgent: noul("Does this message convey urgency?", {
          true: "Explicitly time-sensitive",
          false: "No urgency expressed",
        }),
        department: choice("Which team should handle this?", {
          billing: "Payments, invoicing, refunds",
          technical: "Bugs, outages, integrations",
          sales: "Pricing, upgrades, new accounts",
        }),
        frustration: score("How frustrated is the customer?", ["Calm", "Frustrated", "Very angry"]),
      },
    });

    console.log({ model, usage, answers });
    expect(answers.is_urgent.noul).toBeGreaterThan(0.5);
    expect(["billing", "technical"]).toContain(answers.department.choice);
    expect(answers.frustration.score).toBeGreaterThanOrEqual(0);
    expect(answers.frustration.score).toBeLessThanOrEqual(2);
  }, 60_000);
});
