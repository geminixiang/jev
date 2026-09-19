// OPENROUTER_API_KEY=... npx tsx examples/route-ticket.ts
import { choice, createBuiltinJevModels, noul, score } from "@geminixiang/jev";

const models = createBuiltinJevModels();
const model = models.getModel("openrouter", "jev-latest");
if (!model) throw new Error("no model");

const { answers } = await models.evaluate(model, {
  state: "Help! My payouts have been failing for 3 days.",
  questions: {
    is_urgent: noul("Does this message convey urgency?"),
    department: choice("Which team should handle this?", {
      billing: "Payments, invoicing, refunds",
      technical: "Bugs, outages, integrations",
      sales: "Pricing, upgrades, new accounts",
    }),
    frustration: score("How frustrated is the customer?", ["Calm", "Frustrated", "Very angry"]),
  },
});

// Code owns the decision; Jev supplies calibrated signals.
if (answers.department.confidence < 0.5) {
  console.log("unsure which team; route to human", answers.department.probabilities);
} else if (answers.is_urgent.noul > 0.8) {
  console.log(`escalate to ${answers.department.choice}`);
} else {
  console.log(`queue for ${answers.department.choice}`);
}
