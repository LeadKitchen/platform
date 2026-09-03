import { type AiSdkVendor, createAiSdkProvider } from "./ai-sdk";
import type {
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmStreamResult,
} from "./types";

/**
 * A pool of interchangeable endpoints with automatic failover.
 *
 * Free and shared endpoints run out of quota, rate-limit and go down mid-run.
 * Without failover a benchmark simply dies half-way and the arms that happened
 * to run last look broken — which is exactly the wrong conclusion to hand a
 * customer.
 *
 * The pool records which candidate served every call, because failover has a
 * cost the numbers must not hide: if one arm ran on a strong model and the next
 * fell back to a small one, the comparison between them is meaningless. The
 * report surfaces that mix rather than silently averaging over it.
 */
export interface PoolCandidate {
  /** Short label used in logs and in the report. */
  id: string;
  vendor: AiSdkVendor;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  supportsStructuredOutputs?: boolean;
  headers?: Record<string, string>;
  maxOutputTokens?: number;
  /**
   * Candidates that share one quota bucket.
   *
   * Free tiers usually meter the account, not the model: OpenRouter answers
   * "Rate limit exceeded: free-models-per-day" for *every* free model once the
   * daily allowance is gone. Cooling down one model at a time would then burn
   * a failed request per model before giving up, so an account-level refusal
   * sidelines the whole group at once. Defaults to the key + endpoint.
   */
  quotaGroup?: string;
}

export type PoolFailureKind = "availability" | "capability";

export interface PoolEvent {
  candidateId: string;
  kind: PoolFailureKind;
  message: string;
  cooldownUntil?: number;
}

export interface PoolStats {
  /** How many calls each candidate served successfully. */
  servedBy: Record<string, number>;
  /** Availability failures (quota, rate limit, network) per candidate. */
  availabilityFailures: Record<string, number>;
  /** Schema/quality failures per candidate. */
  capabilityFailures: Record<string, number>;
  /** Candidates currently in cooldown, with the timestamp they recover. */
  coolingDown: Record<string, number>;
}

export interface PoolProviderOptions {
  candidates: PoolCandidate[];
  /** How long a candidate sits out after an availability failure. */
  cooldownMs?: number;
  /** Attempts per candidate before moving on. */
  attemptsPerCandidate?: number;
  onEvent?: (event: PoolEvent) => void;
  /** Injectable transport, shared by every candidate. */
  fetchImpl?: typeof fetch;
}

export interface PoolProvider extends LlmProvider {
  stats(): PoolStats;
}

/**
 * Availability failures are about the endpoint, not the answer: quota, rate
 * limits, billing, transport. They deserve a cooldown so the pool stops
 * hammering a candidate that is out of budget for the next hour.
 */
/**
 * Refusals that are about the account, not this particular model.
 *
 * Distinguishing the two is what stops the pool from walking through every
 * candidate on an exhausted key. Phrasing varies by vendor: OpenRouter says
 * "free-models-per-day", Groq says "tokens per day (TPD)" — the pattern needs
 * both the hyphenated and spaced forms, or a same-key sibling wastes a call
 * finding out its quota is gone too instead of being cooled down immediately.
 */
const ACCOUNT_LEVEL_PATTERN =
  /free-models-per-day|per[- ]day|\bTPD\b|\bRPD\b|daily limit|insufficient|balance|credit|额度|quota exceeded/i;

const AVAILABILITY_PATTERN =
  /额度|quota|rate.?limit|too many requests|\b(402|408|429|5\d\d)\b|insufficient|balance|credit|overloaded|unavailable|ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|timeout|aborted/i;

function classify(error: unknown): PoolFailureKind {
  const statusCode = (error as { statusCode?: number })?.statusCode;
  // 400 is the one status that means "your request was wrong" rather than
  // "the endpoint is unhappy" — everything else is worth a cooldown.
  if (typeof statusCode === "number") {
    return statusCode === 400 ? "capability" : "availability";
  }

  const message = error instanceof Error ? error.message : String(error);
  return AVAILABILITY_PATTERN.test(message) ? "availability" : "capability";
}

export function createPoolProvider(options: PoolProviderOptions): PoolProvider {
  if (options.candidates.length === 0) {
    throw new Error("Пул провайдеров пуст: нужен хотя бы один кандидат");
  }

  const cooldownMs = options.cooldownMs ?? 5 * 60_000;
  const attemptsPerCandidate = Math.max(1, options.attemptsPerCandidate ?? 2);

  const groupOf = (candidate: PoolCandidate): string =>
    candidate.quotaGroup ??
    `${candidate.baseUrl ?? ""}|${candidate.apiKey ?? ""}`;

  const providers = options.candidates.map((candidate) => ({
    candidate,
    provider: createAiSdkProvider({
      vendor: candidate.vendor,
      model: candidate.model,
      apiKey: candidate.apiKey,
      baseUrl: candidate.baseUrl,
      supportsStructuredOutputs: candidate.supportsStructuredOutputs,
      headers: candidate.headers,
      maxOutputTokens: candidate.maxOutputTokens,
      maxAttempts: attemptsPerCandidate,
      fetchImpl: options.fetchImpl,
    }),
  }));

  const servedBy: Record<string, number> = {};
  const availabilityFailures: Record<string, number> = {};
  const capabilityFailures: Record<string, number> = {};
  const coolingDown: Record<string, number> = {};

  function isAvailable(candidateId: string, now: number): boolean {
    const until = coolingDown[candidateId];
    return until === undefined || until <= now;
  }

  function orderedCandidates() {
    const now = Date.now();
    // Prefer candidates that are not cooling down, but keep the cooling ones
    // as a last resort: a stale cooldown must not fail a run outright.
    return [
      ...providers.filter((entry) => isAvailable(entry.candidate.id, now)),
      ...providers.filter((entry) => !isAvailable(entry.candidate.id, now)),
    ];
  }

  /** Cooldown/failure bookkeeping shared by `generate` and `generateStream`. */
  function recordFailure(candidate: PoolCandidate, cause: unknown): string {
    const kind = classify(cause);
    const message = cause instanceof Error ? cause.message : String(cause);

    if (kind === "availability") {
      availabilityFailures[candidate.id] =
        (availabilityFailures[candidate.id] ?? 0) + 1;
      const until = Date.now() + cooldownMs;
      coolingDown[candidate.id] = until;

      if (ACCOUNT_LEVEL_PATTERN.test(message)) {
        // The whole key is spent — every sibling shares the counter.
        for (const sibling of options.candidates) {
          if (groupOf(sibling) === groupOf(candidate)) {
            coolingDown[sibling.id] = until;
          }
        }
      }
    } else {
      capabilityFailures[candidate.id] =
        (capabilityFailures[candidate.id] ?? 0) + 1;
    }

    options.onEvent?.({
      candidateId: candidate.id,
      kind,
      message,
      cooldownUntil: coolingDown[candidate.id],
    });

    return `${candidate.id}: ${message.split("\n")[0]}`;
  }

  return {
    id: "pool",
    // The nominal model is the first candidate; `stats()` reports what actually
    // served each call.
    model: options.candidates[0]?.model ?? "pool",

    stats: () => ({
      servedBy: { ...servedBy },
      availabilityFailures: { ...availabilityFailures },
      capabilityFailures: { ...capabilityFailures },
      coolingDown: { ...coolingDown },
    }),

    async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
      const errors: string[] = [];

      for (const { candidate, provider } of orderedCandidates()) {
        request.signal?.throwIfAborted();
        try {
          const result = await provider.generate(request);
          servedBy[candidate.id] = (servedBy[candidate.id] ?? 0) + 1;
          delete coolingDown[candidate.id];
          return result;
        } catch (cause) {
          if (request.signal?.aborted) throw cause;
          errors.push(recordFailure(candidate, cause));
        }
      }

      throw new Error(
        `Все кандидаты пула отказали для ${request.purpose}:\n${errors.join("\n")}`,
      );
    },

    generateStream<T>(request: LlmRequest<T>): LlmStreamResult<T> {
      // `result` settles from inside `chunks()`, so — same contract as every
      // `generateStream` implementation — the caller must fully consume
      // `stream` for it to resolve.
      let resolveResult!: (value: LlmResult<T>) => void;
      let rejectResult!: (reason: unknown) => void;
      const result = new Promise<LlmResult<T>>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });

      async function* chunks(): AsyncGenerator<Partial<T>> {
        const errors: string[] = [];

        for (const { candidate, provider } of orderedCandidates()) {
          request.signal?.throwIfAborted();
          const attempt = provider.generateStream<T>(request);
          let yieldedAny = false;

          try {
            for await (const partial of attempt.stream) {
              yieldedAny = true;
              yield partial;
            }
            const finalResult = await attempt.result;
            servedBy[candidate.id] = (servedBy[candidate.id] ?? 0) + 1;
            delete coolingDown[candidate.id];
            resolveResult(finalResult);
            return;
          } catch (cause) {
            if (request.signal?.aborted) {
              rejectResult(cause);
              throw cause;
            }

            if (yieldedAny) {
              // Partial output already reached the caller — switching
              // candidates now would mean silently rewriting what the user
              // has already seen, which is worse than surfacing the failure.
              rejectResult(cause);
              throw cause;
            }

            errors.push(recordFailure(candidate, cause));
          }
        }

        const err = new Error(
          `Все кандидаты пула отказали для ${request.purpose}:\n${errors.join("\n")}`,
        );
        rejectResult(err);
        throw err;
      }

      return { stream: chunks(), result };
    },
  };
}
