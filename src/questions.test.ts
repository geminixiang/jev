import { describe, expect, it } from "vitest";
import { JevConfigError } from "./errors.js";
import { canonicalJevVersion } from "./providers/model.js";
import { choice, noul, score, validateQuestions } from "./questions.js";

describe("question helpers", () => {
  it("noul without criteria omits the key", () => {
    expect(noul("q")).toEqual({ type: "noul", instructions: "q" });
    expect(noul("q", { true: "y" })).toEqual({
      type: "noul",
      instructions: "q",
      criteria: { true: "y" },
    });
  });

  it("choice / score keep criteria", () => {
    expect(choice("q", { a: null, b: "B" })).toEqual({
      type: "choice",
      instructions: "q",
      criteria: { a: null, b: "B" },
    });
    expect(score("q", ["lo", "hi"])).toEqual({
      type: "score",
      instructions: "q",
      criteria: ["lo", "hi"],
    });
  });
});

describe("validateQuestions", () => {
  it("rejects empty", () => {
    expect(() => validateQuestions({})).toThrow(JevConfigError);
  });
  it("rejects choice with <2 options", () => {
    expect(() => validateQuestions({ x: choice("q", { a: null }) })).toThrow(/at least 2 options/);
  });
  it("rejects score with <2 levels", () => {
    expect(() => validateQuestions({ x: { type: "score", criteria: ["one"] as never } })).toThrow(
      /at least 2 levels/,
    );
  });
  it("rejects unknown type", () => {
    expect(() => validateQuestions({ x: { type: "bool" } as never })).toThrow(/unknown type/);
  });
  it("accepts valid", () => {
    expect(() =>
      validateQuestions({
        a: noul("q"),
        b: choice("q", { x: null, y: null }),
        c: score("q", ["a", "b"]),
      }),
    ).not.toThrow();
  });
});

describe("canonicalJevVersion", () => {
  it.each([
    [undefined, "latest"],
    ["latest", "latest"],
    ["jev-latest", "latest"],
    ["~typesafe/jev-latest", "latest"],
    ["typesafe/jev", "latest"],
    ["typesafe-ai/jev", "latest"],
    ["jev-1.13", "1.13"],
    ["1.13.0", "1.13.0"],
    ["~typesafe/jev-1.13", "1.13"],
  ])("%s -> %s", (input, expected) => {
    expect(canonicalJevVersion(input)).toBe(expected);
  });
});
