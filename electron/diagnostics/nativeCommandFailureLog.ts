import { appendDiagnosticLog } from './diagnosticLog.js';

// A command failing in a polling loop must not evict other evidence from the bounded daily log.
const REPEAT_WINDOW_MS = 60_000;
const MAX_TRACKED_FAILURES = 200;
const lastLoggedAt = new Map<string, number>();

function describeError(error: unknown) {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return { message: error.message, name: error.name, ...(typeof code === 'string' ? { code } : {}) };
  }
  return { message: typeof error === 'string' ? error : String(error) };
}

function shouldLog(key: string, now: number) {
  const previous = lastLoggedAt.get(key);
  if (previous !== undefined && now - previous < REPEAT_WINDOW_MS) return false;
  if (lastLoggedAt.size >= MAX_TRACKED_FAILURES) lastLoggedAt.clear();
  lastLoggedAt.set(key, now);
  return true;
}

// Records every native command failure once at the IPC boundary; the error still reaches the caller.
export async function recordNativeCommandFailure(command: string, error: unknown, now = Date.now()) {
  const described = describeError(error);
  if (!shouldLog(`${command}\u0000${described.message}`, now)) return;
  // Awaited so the record is on disk before the caller sees the error; logging failures are swallowed.
  await appendDiagnosticLog({
    event: 'native_command_failed',
    level: 'warn',
    occurred_at: new Date(now).toISOString(),
    payload: { command, error: described },
    source: 'electron.main'
  }).catch(() => undefined);
}

export function resetNativeCommandFailureLogForTests() {
  lastLoggedAt.clear();
}
