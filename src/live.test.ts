/**
 * Live smoke test. Opt-in:
 *   JEV_LIVE=1 JEV_LIVE_PROVIDER=openrouter OPENROUTER_API_KEY=... npm run test:live
 */
import { describe, expect, it } from "vitest";
import { choice, createBuiltinJevModels, noul, score } from "./index.js";

const providerId = process.env.JEV_LIVE_PROVIDER ?? "openrouter";
const enabled = process.env.JEV_LIVE === "1";

describe.skipIf(!enabled)(`live: ${providerId}`, () => {
  it("answers the canonical support-ticket example", async () => {
    const models = createBuiltinJevModels();
    const model = models.getModel(providerId, "jev-latest");
    if (!model) throw new Error(`no jev-latest for ${providerId}`);
    const {
      answers,
      model: reported,
      usage,
    } = await models.evaluate(model, {
      state: "Help! My payouts have been failing for 3 days.",
      questions: {
        is_urgent: noul("Does this message convey urgency?"),
        department: choice("Which team should handle this?", {
          billing: "Payments",
          technical: "Bugs",
          sales: "Pricing",
        }),
        frustration: score("How frustrated is the customer?", ["Calm", "Frustrated", "Very angry"]),
      },
    });
    console.log({ reported, usage, answers });
    expect(answers.is_urgent.noul).toBeGreaterThan(0.5);
    expect(["billing", "technical"]).toContain(answers.department.choice);
    expect(answers.frustration.score).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
