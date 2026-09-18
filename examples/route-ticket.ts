// npx tsx examples/route-ticket.ts
import { JevClient, choice, noul, score } from "jev-sdk";

const jev = new JevClient("openrouter"); // JEV_API_KEY from env

const ticket = "Help! My payouts have been failing for 3 days.";

const { answers } = await jev.evaluate({
  state: ticket,
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

if (answers.is_urgent.noul > 0.8 && answers.department.confidence > 0.7) {
  console.log(`escalate to ${answers.department.choice}`);
} else {
  console.log("queue for human triage", answers);
}
