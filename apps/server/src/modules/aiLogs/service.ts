import { recordAiCallLog } from './repository.js';

export interface AiCallMeta {
  userId: string;
  chunkId: string | null;
  provider: string;
  model: string | null;
  request: unknown;
}

/**
 * Runs one AI provider call, logging it to ai_call_logs on both success and
 * failure, then rethrows on failure (the caller still owns turning that
 * into an HTTP response). Logging itself never blocks or fails the caller —
 * a broken audit log is not a reason to break the feature it's logging —
 * but a failure to write it IS logged (to stderr) rather than silently
 * dropped, since that log is the only way anyone would notice it happening.
 */
export async function withAiCallLogging<T>(meta: AiCallMeta, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  let result: T;
  try {
    result = await fn();
  } catch (err) {
    await recordAiCallLog({ ...meta, response: null, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - startedAt }).catch((logErr) => {
      console.error('recordAiCallLog failed', { message: logErr instanceof Error ? logErr.message : String(logErr) });
    });
    throw err;
  }
  await recordAiCallLog({ ...meta, response: result, error: null, durationMs: Date.now() - startedAt }).catch((logErr) => {
    console.error('recordAiCallLog failed', { message: logErr instanceof Error ? logErr.message : String(logErr) });
  });
  return result;
}
