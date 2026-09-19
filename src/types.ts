/**
 * Core types. The shape mirrors pi-ai: a `JevModel` is a catalog entry, a
 * `JevProvider` owns auth + a model list + an API implementation, and
 * `JevModels` is the runtime collection that resolves auth and dispatches.
 * The request/answer types follow TypeSafe's System One API.
 */
import type { AuthResult, ProviderAuth, ProviderEnv, ProviderHeaders } from "@earendil-works/pi-ai";

// ---------------------------------------------------------------------------
// Entries (state, instructions, criteria descriptions)
// ---------------------------------------------------------------------------

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Text, a JSON object/array, or null. Jev reads structure. */
export type Entry = string | { [key: string]: JsonValue } | JsonValue[] | null;

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

/**
 * Per-question dependency keys, understood by self-hosted djev-spark servers
 * (cloud backends ignore or reject them; the built-in cloud APIs do not send
 * them). See djev-spark's README, "Dependencies".
 */
export interface QuestionDependencies {
  /** Read this question in a later stage, with these questions' answers in its prompt. */
  depends_on?: readonly string[];
  /**
   * Ask only when the named question's answer is in the list (option names,
   * level names, or "yes"/"no"). Implies `depends_on`. A skipped question's
   * answer is `null`.
   */
  ask_if?: { readonly [question: string]: readonly string[] };
  /** Read this question in a canvas of its own, beside the others in its stage. */
  alone?: boolean;
}

export interface NoulQuestion extends QuestionDependencies {
  type: "noul";
  instructions?: Entry;
  /** Optional descriptions of the yes / no outcomes. */
  criteria?: { true?: Entry; false?: Entry };
}

/** option id -> description (null leaves the id undescribed) */
export type ChoiceCriteria = { readonly [option: string]: Entry };

export interface ChoiceQuestion<T extends ChoiceCriteria = ChoiceCriteria>
  extends QuestionDependencies {
  type: "choice";
  instructions?: Entry;
  criteria: T;
}

/** Ordered rubric, index 0 = lowest. At least two levels. */
export type ScoreCriteria = readonly [Entry, Entry, ...Entry[]];

export interface ScoreQuestion<T extends ScoreCriteria = ScoreCriteria>
  extends QuestionDependencies {
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
}

export interface ChoiceAnswer<T extends ChoiceCriteria = ChoiceCriteria> {
  type: "choice";
  choice: keyof T & string;
  probabilities: { [K in keyof T]: number };
  /**
   * 0..1 statistic over `probabilities`; low = no option clearly fits.
   * Omitted by backends that do not report it (e.g. Vercel AI Gateway).
   */
  confidence?: number;
}

export interface ScoreAnswer {
  type: "score";
  /** Expected level index; may be fractional. */
  score: number;
  /** index -> probability */
  probabilities: Record<string, number>;
  /** index -> rubric text, as echoed by the API. */
  legend?: Record<string, Entry>;
  /** Omitted by backends that do not report it (e.g. Vercel AI Gateway). */
  confidence?: number;
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

/** An `ask_if` question may be skipped, in which case its answer is `null`. */
type MaybeGated<Q, A> = Q extends { ask_if: object } ? A | null : A;

export type AnswerFor<Q extends Question> = Q extends NoulQuestion
  ? MaybeGated<Q, NoulAnswer>
  : Q extends ChoiceQuestion<infer T>
    ? MaybeGated<Q, ChoiceAnswer<T>>
    : Q extends ScoreQuestion
      ? MaybeGated<Q, ScoreAnswer>
      : never;

export type Answers<Qs extends Questions> = { readonly [K in keyof Qs]: AnswerFor<Qs[K]> };

// ---------------------------------------------------------------------------
// Models and providers (pi-ai shaped)
// ---------------------------------------------------------------------------

export type KnownJevApi =
  | "typesafe-systemone"
  | "openrouter-decisions"
  | "cloudflare-workers-ai"
  | "djev-systemone";
/** Wire protocol id. Open so custom providers can register their own. */
export type JevApi = KnownJevApi | (string & {});

export type KnownJevProvider = "typesafe" | "openrouter" | "cloudflare" | "djev";
export type JevProviderId = KnownJevProvider | (string & {});

export interface JevModelCost {
  /** USD per million input tokens */
  input: number;
  /** USD per million output tokens */
  output: number;
}

/** A catalog entry: which provider serves it, over which API, at which endpoint. */
export interface JevModel<TApi extends JevApi = JevApi> {
  /** Provider-neutral id, e.g. "jev-latest", "jev-1.13". */
  id: string;
  name: string;
  api: TApi;
  provider: JevProviderId;
  baseUrl: string;
  /** Provider-specific model slug sent on the wire, e.g. "~typesafe/jev-1.13". */
  slug: string;
  cost: JevModelCost;
  headers?: Record<string, string>;
}

/** An image for backends that take them (djev-spark): a data URL or a typed blob. */
export type JevImage = string | { content_type: string; base64: string };

/**
 * Request extensions understood by self-hosted djev-spark servers, in their
 * wire (snake_case) names so they pass through unchanged. The built-in cloud
 * APIs do not send them; see djev-spark's README, "Extensions".
 */
export interface JevRequestExtensions {
  /** Seeds the noise draws; same request + same seed = same answer. */
  seed?: number;
  /** Noise draws to average, or "auto" (read again while entropy is high). */
  samples?: number | "auto";
  /** Maximum reads under samples: "auto". */
  auto_max?: number;
  /** Entropy above which "auto" reads again. */
  auto_threshold?: number;
  /** Up to this many tokens of thought before the read; the read conditions on it. */
  think?: number;
  /** Context rendered ahead of the questions. */
  instructions?: Entry;
  /** Split a long question list into chunks of at most this many rows. */
  chunk_rows?: number;
  /** Whether each chunk's prompt lists only its own questions or every question. */
  chunk_prompt?: "own" | "shared";
  /** Run chunks in order, later answers conditioning on earlier ones. Text-only states. */
  sequential?: boolean;
  /** Answer only these question ids in one read; the rest are skipped. */
  ask?: readonly string[];
  /** Denoise steps per read. */
  steps?: number;
  /** Images, ahead of the state in the prompt (JSON form). */
  images?: readonly JevImage[];
}

export interface JevRequest<Qs extends Questions = Questions> extends JevRequestExtensions {
  state: Entry;
  questions: Qs;
}

export interface JevUsage {
  input: number;
  output: number;
  totalTokens: number;
  cost: { input: number; output: number; total: number };
}

export interface JevResult<Qs extends Questions = Questions> {
  provider: JevProviderId;
  /** Model id as reported by the backend, when it reports one. */
  model: string;
  answers: Answers<Qs>;
  usage: JevUsage;
  /** Untouched backend payload for debugging. */
  raw: unknown;
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Per-request options accepted by `JevModels.evaluate()`. */
export interface EvaluateOptions {
  /** Explicit key wins over resolved auth. */
  apiKey?: string;
  /** Provider-scoped env overrides (e.g. Cloudflare account id). */
  env?: ProviderEnv;
  headers?: ProviderHeaders;
  signal?: AbortSignal;
  /** Default 30_000. */
  timeoutMs?: number;
  /** Default 2. Only 408 / 429 / 5xx / connection / timeout are retried. */
  maxRetries?: number;
  fetch?: Fetch;
}

/** What an API implementation receives after auth and options are merged. */
export interface ResolvedEvaluateOptions {
  apiKey?: string;
  env: ProviderEnv;
  headers: Record<string, string>;
  signal: AbortSignal;
  fetch: Fetch;
}

/**
 * A wire-protocol implementation: the Jev counterpart of pi-ai's
 * `ProviderStreams`. Knows nothing about auth resolution.
 */
export interface JevApiImpl<TApi extends JevApi = JevApi> {
  readonly api: TApi;
  evaluate(
    model: JevModel<TApi>,
    request: JevRequest,
    options: ResolvedEvaluateOptions,
  ): Promise<JevResult>;
}

/**
 * A provider: identity, auth, model catalog, and evaluation. The Jev
 * counterpart of pi-ai's `Provider`.
 */
export interface JevProvider<TApi extends JevApi = JevApi> {
  readonly id: JevProviderId;
  readonly name: string;
  readonly auth: ProviderAuth;
  getModels(): readonly JevModel<TApi>[];
  evaluate(
    model: JevModel<TApi>,
    request: JevRequest,
    options: ResolvedEvaluateOptions,
  ): Promise<JevResult>;
}

/** Runtime collection of providers: the Jev counterpart of pi-ai's `Models`. */
export interface JevModels {
  getProviders(): readonly JevProvider[];
  getProvider(id: string): JevProvider | undefined;
  getModels(provider?: string): readonly JevModel[];
  getModel(provider: string, id: string): JevModel | undefined;
  /** Resolve provider auth; undefined when unknown or unconfigured. */
  getAuth(providerId: string): Promise<AuthResult | undefined>;
  getAuth(model: JevModel): Promise<AuthResult | undefined>;
  /** Models whose provider has complete auth configuration. */
  getAvailable(providerId?: string): Promise<readonly JevModel[]>;
  evaluate<Qs extends Questions>(
    model: JevModel,
    request: JevRequest<Qs>,
    options?: EvaluateOptions,
  ): Promise<JevResult<Qs>>;
}

export interface MutableJevModels extends JevModels {
  setProvider(provider: JevProvider): void;
  deleteProvider(id: string): void;
  clearProviders(): void;
}
