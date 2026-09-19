import { JevConfigError } from "./errors.js";
import type {
  ChoiceCriteria,
  ChoiceQuestion,
  Entry,
  NoulQuestion,
  Question,
  Questions,
  ScoreCriteria,
  ScoreQuestion,
} from "./types.js";

/** Yes/no question; answered as the probability of "yes". */
export function noul(
  instructions: Entry,
  criteria?: { true?: Entry; false?: Entry },
): NoulQuestion {
  return criteria ? { type: "noul", instructions, criteria } : { type: "noul", instructions };
}

/** Pick one option. The keys of `criteria` type the `choice` answer. */
export function choice<const T extends ChoiceCriteria>(
  instructions: Entry,
  criteria: T,
): ChoiceQuestion<T> {
  return { type: "choice", instructions, criteria };
}

/** Ordered rubric; index 0 is the lowest level. */
export function score<const T extends ScoreCriteria>(
  instructions: Entry,
  criteria: T,
): ScoreQuestion<T> {
  return { type: "score", instructions, criteria };
}

/** Throws JevConfigError if any question is malformed. */
export function validateQuestions(questions: Questions): void {
  const names = Object.keys(questions);
  if (names.length === 0)
    throw new JevConfigError("`questions` must contain at least one question.");
  for (const name of names) {
    const q = questions[name] as Question | undefined;
    if (!q || typeof q !== "object")
      throw new JevConfigError(`question "${name}" must be an object.`);
    switch (q.type) {
      case "noul":
        break;
      case "choice": {
        const keys = Object.keys(q.criteria ?? {});
        if (keys.length < 2)
          throw new JevConfigError(
            `choice question "${name}" needs at least 2 options, got ${keys.length}.`,
          );
        break;
      }
      case "score":
        if (!Array.isArray(q.criteria) || q.criteria.length < 2) {
          throw new JevConfigError(`score question "${name}" needs an array of at least 2 levels.`);
        }
        break;
      default:
        throw new JevConfigError(
          `question "${name}" has unknown type "${String((q as { type?: unknown }).type)}". Expected noul | choice | score.`,
        );
    }
  }
}
