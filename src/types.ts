/**
 * Core Jev types (provider-neutral).
 *
 * Jev answers typed questions about a "state". Three question types exist:
 *  - noul   : yes/no probability in [0, 1]
 *  - choice : pick one of caller-defined options, with full distribution
 *  - score  : position on an ordered rubric, with full distribution
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Text, JSON object/array, or null. Used for state, instructions and criteria. */
export type Entry = string | { [key: string]: JsonValue } | JsonValue[] | null;

/** The thing Jev evaluates. */
export type JevState = Entry;

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export interface NoulQuestion {
  type: "noul";
  instructions?: Entry;
  /** Optional descriptions of what counts as true / false. */
  criteria?: { true?: Entry; false?: Entry };
}

/** option id -> description (null = no description) */
export type ChoiceCriteria = { readonly [option: string]: Entry };

export interface ChoiceQuestion<T extends ChoiceCriteria = ChoiceCriteria> {
  type: "choice";
  instructions?: Entry;
  criteria: T;
}

/** Ordered rubric, index 0 = lowest. At least two levels. */
export type ScoreCriteria = readonly [Entry, Entry, ...Entry[]];

export interface ScoreQuestion<T extends ScoreCriteria = ScoreCriteria> {
  type: "score";
  instructions?: Entry;
  criteria: T;
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export type Questions = { readonly [name: string]: Question };

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export interface NoulAnswer {
  type: "noul";
  /** Probability of "yes", 0..1 */
  noul: number;
  confidence?: number;
}

export interface ChoiceAnswer<T extends ChoiceCriteria = ChoiceCriteria> {
  type: "choice";
  choice: keyof T & string;
  confidence: number;
  probabilities: { [K in keyof T]: number };
}

export interface ScoreAnswer {
  type: "score";
  /** Expected value over the rubric index (e.g. 1.04); may be fractional. */
  score: number;
  confidence: number;
  /** index -> rubric label */
  legend: Record<string, Entry>;
  /** index -> probability */
  probabilities: Record<string, number>;
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

/** Map a question definition to its answer type, preserving choice keys. */
export type AnswerFor<Q extends Question> = Q extends NoulQuestion
  ? NoulAnswer
  : Q extends ChoiceQuestion<infer T>
    ? ChoiceAnswer<T>
    : Q extends ScoreQuestion
      ? ScoreAnswer
      : never;

export type Answers<Qs extends Questions> = {
  readonly [K in keyof Qs]: AnswerFor<Qs[K]>;
};

// ---------------------------------------------------------------------------
// Request / response (provider-neutral)
// ---------------------------------------------------------------------------

export interface JevUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface JevRequest<Qs extends Questions = Questions> {
  state: JevState;
  questions: Qs;
  /**
   * Model override. Provider-neutral names are accepted ("jev-latest",
   * "jev-1.13") and mapped to each provider's slug automatically.
   */
  model?: string;
}

export interface JevResponse<Qs extends Questions = Questions> {
  /** Resolved model id as reported by the provider, e.g. "jev-1.13.0" */
  model?: string | undefined;
  answers: Answers<Qs>;
  usage?: JevUsage | undefined;
  /** Which provider served the request. */
  provider: string;
  /** Raw provider payload, for debugging. */
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface EvaluateOptions {
  /** Abort the underlying request. */
  signal?: AbortSignal;
  /** Per-request timeout in ms. Default: client-level timeout. */
  timeoutMs?: number;
  /** Extra headers merged into the request. */
  headers?: Record<string, string>;
}

/**
 * A provider knows how to deliver a JevRequest to one backend and
 * normalise the result into a JevResponse. Implement this to add a backend.
 */
export interface JevProvider {
  readonly name: string;
  evaluate(request: JevRequest, options: ResolvedEvaluateOptions): Promise<JevResponse>;
}

export interface ResolvedEvaluateOptions {
  signal: AbortSignal;
  headers: Record<string, string>;
  fetch: Fetch;
}
