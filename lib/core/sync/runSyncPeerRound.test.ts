import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { runSyncPeerRound } from './runSyncPeerRound.js';
import { createSyncPeerRoundOwnership } from './syncPeerRoundOwnership.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('retries discovery timeouts after releasing ownership and bounds persistent timeout failure', async () => {
  const owner = createSyncPeerRoundOwnership(5000);
  const execute = vi.fn(async () => {
    if (execute.mock.calls.length === 1) throw new DOMException('Discovery timed out', 'TimeoutError');
    return 'complete';
  });
  const work = runSyncPeerRound({ owner, peerId: 'peer', execute });
  await vi.advanceTimersByTimeAsync(0);
  owner.acceptInbound('peer', 'while-waiting', true).release();
  await vi.runAllTimersAsync();
  expect(await work).toBe('complete');
  const timedOut = vi.fn(async () => { throw new DOMException('Discovery timed out', 'TimeoutError'); });
  const failed = expect(runSyncPeerRound({ owner, peerId: 'peer', execute: timedOut }))
    .rejects.toThrow('Discovery timed out');
  await vi.runAllTimersAsync();
  await failed;
  expect(timedOut).toHaveBeenCalledTimes(3);
  expect(owner.acquireOutbound('next-peer', 'after-timeout')).not.toBeNull();
  owner.close();
});

it('releases the peer before jitter and starts a fresh round on retry', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const owner = createSyncPeerRoundOwnership(5000);
  const rounds: string[] = [];
  const execute = vi.fn(async (id: string) => {
    rounds.push(id);
    if (rounds.length === 1) throw new Error('framed_sync_http_409:sync_round_busy');
    return 'complete';
  });
  const work = runSyncPeerRound({ owner, peerId: 'peer', execute });
  await vi.advanceTimersByTimeAsync(0);
  const incoming = owner.acceptInbound('peer', 'incoming-during-backoff', true);
  incoming.release();
  await vi.advanceTimersByTimeAsync(550);
  expect(await work).toBe('complete');
  expect(new Set(rounds).size).toBe(2);
  expect(owner.acquireOutbound('peer', 'after-complete')).not.toBeNull();
  owner.close();
});

it('bounds busy retries and releases the outbound queue for another peer', async () => {
  const owner = createSyncPeerRoundOwnership(5000);
  const execute = vi.fn(async () => { throw new Error('sync_round_busy'); });
  const result = expect(runSyncPeerRound({ owner, peerId: 'busy', execute })).rejects.toThrow('sync_round_busy');
  await vi.runAllTimersAsync();
  await result;
  expect(execute).toHaveBeenCalledTimes(3);
  expect(owner.acquireOutbound('available', 'next')).not.toBeNull();
  owner.close();
});

it('releases an active round when the foreground signal ends', async () => {
  const owner = createSyncPeerRoundOwnership(5000);
  const controller = new AbortController();
  const work = runSyncPeerRound({ owner, peerId: 'peer', signal: controller.signal,
    execute: async (_id, lease) => new Promise<void>((_resolve, reject) =>
      lease.signal.addEventListener('abort', () => reject(lease.signal.reason), { once: true })) });
  const result = expect(work).rejects.toThrow('background');
  controller.abort(new Error('background'));
  await result;
  expect(owner.acceptInbound('peer', 'incoming', true)).toBeDefined();
  owner.close();
});

it('does not retry data failures and cancels backoff without acquiring again', async () => {
  const owner = createSyncPeerRoundOwnership(5000);
  const dataFailure = vi.fn(async () => { throw new Error('checksum mismatch'); });
  await expect(runSyncPeerRound({ owner, peerId: 'peer', execute: dataFailure })).rejects.toThrow('checksum mismatch');
  expect(dataFailure).toHaveBeenCalledOnce();
  const controller = new AbortController();
  const busy = vi.fn(async () => { throw new Error('sync_round_busy'); });
  const result = expect(runSyncPeerRound({ owner, peerId: 'peer', signal: controller.signal, execute: busy }))
    .rejects.toThrow('background');
  await vi.advanceTimersByTimeAsync(0);
  controller.abort(new Error('background'));
  await result;
  await vi.runAllTimersAsync();
  expect(busy).toHaveBeenCalledOnce();
  owner.close();
});
