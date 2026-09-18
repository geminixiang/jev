/**
 * Type-level tests. Compiled by `npm run typecheck`; never executed.
 */
import { JevClient, choice, noul, score } from "./index.js";

declare const client: JevClient;

async function typed() {
  const { answers } = await client.evaluate({
    state: "s",
    questions: {
      ok: noul("?"),
      team: choice("?", { billing: null, technical: "bugs", sales: null }),
      mood: score("?", ["calm", "angry"]),
    },
  });

  const c: "billing" | "technical" | "sales" = answers.team.choice;
  const p: number = answers.team.probabilities.billing;
  const n: number = answers.ok.noul;
  const s: number = answers.mood.score;

  // @ts-expect-error unknown option
  answers.team.probabilities.refunds;
  // @ts-expect-error unknown question
  answers.nothing;
  // @ts-expect-error noul answers have no choice
  answers.ok.choice;

  return [c, p, n, s];
}

// @ts-expect-error provider is required
new JevClient();
// @ts-expect-error unknown provider name
new JevClient("anthropic");

// @ts-expect-error score needs at least two levels
score("?", ["only"]);

void typed;
