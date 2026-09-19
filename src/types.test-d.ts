import { describe, expectTypeOf, it } from "vitest";
import { choice, noul, score } from "./questions.js";
import type { Answers, ChoiceAnswer, NoulAnswer, ScoreAnswer } from "./types.js";

describe("answer typing", () => {
  it("infers answer shapes from question builders", () => {
    const questions = {
      a: noul("?"),
      b: choice("?", { x: null, y: "why" }),
      c: score("?", ["low", "high"]),
    };
    type A = Answers<typeof questions>;
    expectTypeOf<A["a"]>().toEqualTypeOf<NoulAnswer>();
    expectTypeOf<A["b"]["choice"]>().toEqualTypeOf<"x" | "y">();
    expectTypeOf<A["b"]>().toMatchTypeOf<ChoiceAnswer>();
    expectTypeOf<A["c"]>().toEqualTypeOf<ScoreAnswer>();
  });
});
