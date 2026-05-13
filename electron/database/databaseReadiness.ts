type DatabaseReadinessState = 'failed' | 'pending' | 'ready';

let readinessState: DatabaseReadinessState = 'ready';
let pendingReady: Promise<void> = Promise.resolve();
let resolvePendingReady: (() => void) | null = null;
let rejectPendingReady: ((error: Error) => void) | null = null;
let failedError: Error | null = null;

function toStartupError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }
  return new Error(`Database startup failed: ${String(error)}`);
}

export function beginDatabaseStartup() {
  readinessState = 'pending';
  failedError = null;
  pendingReady = new Promise<void>((resolve, reject) => {
    resolvePendingReady = resolve;
    rejectPendingReady = reject;
  });
  pendingReady.catch(() => undefined);
}

export function markDatabaseReady() {
  if (readinessState !== 'pending') {
    readinessState = 'ready';
    failedError = null;
    return;
  }
  readinessState = 'ready';
  failedError = null;
  resolvePendingReady?.();
  resolvePendingReady = null;
  rejectPendingReady = null;
}

export function markDatabaseStartupFailed(error: unknown) {
  const startupError = toStartupError(error);
  failedError = startupError;
  if (readinessState !== 'pending') {
    readinessState = 'failed';
    return;
  }
  readinessState = 'failed';
  rejectPendingReady?.(startupError);
  resolvePendingReady = null;
  rejectPendingReady = null;
}

export async function waitForDatabaseReady() {
  if (readinessState === 'ready') {
    return;
  }
  if (readinessState === 'failed') {
    throw failedError ?? new Error('Database startup failed.');
  }
  await pendingReady;
}

export function resetDatabaseReadinessForTests() {
  readinessState = 'ready';
  failedError = null;
  pendingReady = Promise.resolve();
  resolvePendingReady = null;
  rejectPendingReady = null;
}
