import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createSyncPeerRoundOwnership } from './syncPeerRoundOwnership.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('shares a peer slot between both directions while admitting unrelated incoming peers', () => {
  const owner = createSyncPeerRoundOwnership(1000);
  const outgoing = owner.acquireOutbound('phone', 'local-round');
  expect(outgoing).not.toBeNull();
  expect(() => owner.acceptInbound('phone', 'remote-round', true)).toThrow('sync_round_busy');
  expect(owner.acquireOutbound('other', 'another-outgoing')).toBeNull();
  expect(owner.acceptInbound('other', 'incoming-other', true)).toBeDefined();
  owner.close();
  expect(outgoing?.signal.aborted).toBe(true);
  expect(() => owner.acquireOutbound('phone', 'next')).toThrow('sync_round_owner_closed');
  expect(() => owner.acceptInbound('phone', 'next', true)).toThrow('sync_round_owner_closed');
});

it('continues accepted internal requests and rejects a competing new round', () => {
  const owner = createSyncPeerRoundOwnership(1000);
  const incoming = owner.acceptInbound('phone', 'round', true);
  expect(owner.acceptInbound('phone', 'round', false)).toBe(incoming);
  expect(() => owner.acceptInbound('phone', 'new-round', true)).toThrow('sync_round_busy');
  owner.finishInbound('phone', 'wrong-round');
  expect(incoming.signal.aborted).toBe(false);
  owner.finishInbound('phone', 'round');
  expect(incoming.signal.aborted).toBe(true);
  expect(owner.acquireOutbound('phone', 'next')).not.toBeNull();
  owner.close();
});

it('releases timed-out rounds and refuses stale internal requests', async () => {
  const owner = createSyncPeerRoundOwnership(1000);
  const incoming = owner.acceptInbound('phone', 'round', true);
  await vi.advanceTimersByTimeAsync(800);
  owner.acceptInbound('phone', 'round', false);
  await vi.advanceTimersByTimeAsync(800);
  expect(incoming.signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(201);
  expect(incoming.signal.aborted).toBe(true);
  expect(() => owner.acceptInbound('phone', 'round', false)).toThrow('sync_round_expired');
  const next = owner.acquireOutbound('phone', 'next');
  incoming.release();
  expect(next?.signal.aborted).toBe(false);
  owner.close();
});

it('allows either side to accept after simultaneous initiators release before backing off', () => {
  const left = createSyncPeerRoundOwnership(1000), right = createSyncPeerRoundOwnership(1000);
  const fromLeft = left.acquireOutbound('right', 'left-round')!;
  const fromRight = right.acquireOutbound('left', 'right-round')!;
  expect(() => right.acceptInbound('left', 'left-round', true)).toThrow('sync_round_busy');
  expect(() => left.acceptInbound('right', 'right-round', true)).toThrow('sync_round_busy');
  fromLeft.release(); fromRight.release();
  expect(right.acceptInbound('left', 'left-retry', true)).toBeDefined();
  expect(right.acquireOutbound('left', 'right-retry')).toBeNull();
  left.close(); right.close();
});
