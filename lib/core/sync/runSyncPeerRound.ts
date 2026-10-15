import type { createSyncPeerRoundOwnership, SyncPeerRoundLease } from './syncPeerRoundOwnership.js';

type RoundOwner = ReturnType<typeof createSyncPeerRoundOwnership>;

/** Bound contention retries so one busy peer cannot monopolize the outbound queue. */
export async function runSyncPeerRound<T>(input: {
  owner: RoundOwner;
  peerId: string;
  signal?: AbortSignal;
  waitForInbound?: () => boolean;
  onWaiting?(waiting: boolean): void;
  execute(roundId: string, lease: SyncPeerRoundLease): Promise<T>;
}) {
  for (let attempt = 0; ; attempt++) {
    input.signal?.throwIfAborted();
    try { return await attemptRound(input); }
    catch (error) {
      input.signal?.throwIfAborted();
      if (attempt >= 2 || isSyncPeerRoundWaitExpired(error) || !isSyncPeerRoundRetryableError(error)) throw error;
    }
    // The attempt's finally has already released ownership before this wait.
    await waitForRetry(100 + Math.floor(Math.random() * 900), input.signal);
  }
}

async function attemptRound<T>(input: {
  owner: RoundOwner;
  peerId: string;
  signal?: AbortSignal;
  waitForInbound?: () => boolean;
  onWaiting?(waiting: boolean): void;
  execute(roundId: string, lease: SyncPeerRoundLease): Promise<T>;
}) {
  const roundId = crypto.randomUUID();
  const lease = input.waitForInbound?.()
    ? await input.owner.waitForInbound(input.peerId, roundId, input.signal, input.onWaiting)
    : input.owner.acquireOutbound(input.peerId, roundId);
  if (!lease) throw new Error('sync_round_busy');
  const cancel = () => lease.release(input.signal?.reason);
  input.signal?.addEventListener('abort', cancel, { once: true });
  try {
    input.signal?.throwIfAborted();
    lease.signal.throwIfAborted();
    const result = await input.execute(roundId, lease);
    lease.signal.throwIfAborted();
    return result;
  } finally {
    input.signal?.removeEventListener('abort', cancel);
    lease.release();
  }
}

export function isSyncPeerRoundRetryableError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'TimeoutError') return true;
  if (!(error instanceof Error)) return false;
  if ('code' in error && ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH']
    .some(code => code === error.code)) return true;
  if (error.message.split(':').some(part => ['sync_round_busy', 'sync_round_expired', 'sync_round_wait_expired', 'TimeoutError']
    .includes(part.trim()))) return true;
  return error.cause instanceof Error && isSyncPeerRoundRetryableError(error.cause);
}

function isSyncPeerRoundWaitExpired(error: unknown) {
  return error instanceof Error && error.message === 'sync_round_wait_expired';
}

function waitForRetry(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}
