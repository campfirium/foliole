import { expect, it } from 'vitest';

import { FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES as capacity, FramedSyncPayloadBudget,
  type FramedSyncPayloadDirection } from './framedSyncPayloadBudget.js';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

it('shares a 4 MiB payload maximum across connections and database/resource lines', async () => {
  const budget = new FramedSyncPayloadBudget();
  const pending = gate();
  const full = gate();
  let activeBytes = 0;
  let maximumBytes = 0;
  let started = 0;
  const jobs = Array.from({ length: 12 }, (_, index) => (async () => {
    const direction: FramedSyncPayloadDirection = index % 2 ? 'inbound' : 'outbound';
    const lease = await budget.acquire({ direction, bytes: capacity / 2 });
    activeBytes += capacity / 2;
    started += 1;
    if (started === 4) full.resolve();
    maximumBytes = Math.max(maximumBytes, activeBytes);
    try { await pending.promise; }
    finally { activeBytes -= capacity / 2; lease.release(); }
  })());
  await full.promise;
  expect(started).toBe(4);
  expect(activeBytes).toBe(4 * 1024 * 1024);
  pending.resolve();
  await Promise.all(jobs);
  expect(maximumBytes).toBe(4 * 1024 * 1024);
  expect(activeBytes).toBe(0);
  budget.close();
  await budget.drained;
});

it('keeps direction guarantees and FIFO without borrowing or bypassing larger waiters', async () => {
  const budget = new FramedSyncPayloadBudget();
  const occupied = await budget.acquire({ direction: 'outbound', bytes: capacity / 2 });
  const order: string[] = [];
  const first = budget.acquire({ direction: 'outbound', bytes: capacity }).then((lease) => { order.push('first'); return lease; });
  const second = budget.acquire({ direction: 'outbound', bytes: 1 }).then((lease) => { order.push('second'); return lease; });
  const incoming = await budget.acquire({ direction: 'inbound', bytes: capacity });
  expect(order).toEqual([]);
  occupied.release();
  const large = await first;
  expect(order).toEqual(['first']);
  large.release();
  (await second).release();
  incoming.release();
  budget.close();
  await budget.drained;
  expect(order).toEqual(['first', 'second']);
});

it('removes aborted head waiters immediately and permits the next fitting waiter', async () => {
  const budget = new FramedSyncPayloadBudget();
  const active = await budget.acquire({ direction: 'inbound', bytes: capacity / 2 });
  const cancellation = new AbortController();
  const head = budget.acquire({ direction: 'inbound', bytes: capacity, signal: cancellation.signal });
  const rejected = expect(head).rejects.toMatchObject({ name: 'AbortError' });
  const next = budget.acquire({ direction: 'inbound', bytes: capacity / 2 });
  cancellation.abort();
  await rejected;
  (await next).release();
  active.release();
  budget.dispose();
  await budget.drained;
});

it('handles grant/abort ordering and double release without leaking or overgranting', async () => {
  const budget = new FramedSyncPayloadBudget();
  const active = await budget.acquire({ direction: 'outbound', bytes: capacity });
  const cancellation = new AbortController();
  const acquisition = budget.acquire({ direction: 'outbound', bytes: capacity, signal: cancellation.signal });
  active.release();
  cancellation.abort();
  const granted = await acquisition;
  let nextGranted = false;
  const next = budget.acquire({ direction: 'outbound', bytes: capacity }).then((lease) => { nextGranted = true; return lease; });
  active.release();
  await Promise.resolve();
  expect(nextGranted).toBe(false);
  granted.release();
  granted.release();
  (await next).release();
  budget.close();
  await budget.drained;
});

it('releases an active slow writer in finally on error without waiting for remote acknowledgement', async () => {
  const budget = new FramedSyncPayloadBudget();
  const disk = gate();
  const started = gate();
  const writer = (async () => {
    const lease = await budget.acquire({ direction: 'outbound', bytes: capacity });
    started.resolve();
    try { await disk.promise; throw new Error('disk_failed'); }
    finally { lease.release(); }
  })();
  await started.promise;
  const rejected = expect(writer).rejects.toThrow('disk_failed');
  const queued = budget.acquire({ direction: 'outbound', bytes: capacity });
  disk.resolve();
  await rejected;
  (await queued).release();
  budget.close();
  await budget.drained;
});

it('cancels queued work on close but drains only after all active directions release', async () => {
  const budget = new FramedSyncPayloadBudget();
  const inbound = await budget.acquire({ direction: 'inbound', bytes: capacity });
  const outbound = await budget.acquire({ direction: 'outbound', bytes: capacity });
  const waiting = budget.acquire({ direction: 'inbound', bytes: 1 });
  const cancelled = expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  let drained = false;
  void budget.drained.then(() => { drained = true; });
  budget.close();
  budget.close();
  await cancelled;
  await expect(budget.acquire({ direction: 'outbound', bytes: 1 })).rejects.toThrow('framed_sync_payload_budget_closed');
  inbound.release();
  await Promise.resolve();
  expect(drained).toBe(false);
  outbound.release();
  await budget.drained;
  expect(drained).toBe(true);
});

it('rejects invalid sizes and already aborted requests, and drains an empty closed owner', async () => {
  const budget = new FramedSyncPayloadBudget();
  for (const bytes of [0, -1, 0.5, NaN, Infinity, capacity + 1]) {
    await expect(budget.acquire({ direction: 'inbound', bytes })).rejects.toThrow('framed_sync_payload_size_invalid');
  }
  await expect(budget.acquire({ direction: 'inbound', bytes: 1, signal: AbortSignal.abort() }))
    .rejects.toMatchObject({ name: 'AbortError' });
  budget.dispose();
  await budget.drained;
});
