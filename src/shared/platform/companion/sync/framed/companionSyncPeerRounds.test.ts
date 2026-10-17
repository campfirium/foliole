import { afterEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ database: {}, active: true, listeners: new Set<() => void>() }));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap.js', () => ({ getIosCompanionDatabaseOwner: () => runtime.database }));
vi.mock('../../../appLifecycle.js', () => ({
  readNativeAppActiveState: async () => runtime.active,
  subscribeNativeAppBackground: async (listener: () => void) => {
    runtime.listeners.add(listener);
    return () => { runtime.listeners.delete(listener); };
  }
}));

import { attachmentWorkBudget } from '../../../../../../lib/core/sync/attachmentWorkBudget.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

import { closeCompanionSyncPeerRounds, companionSyncPeerRoundOwner, withCompanionSyncPeerRound } from './companionSyncPeerRounds.js';

afterEach(() => {
  closeCompanionSyncPeerRounds(getIosCompanionDatabaseOwner());
  runtime.active = true;
  runtime.listeners.clear();
  vi.useRealTimers();
});

it('waits for a draining resource slice instead of exhausting busy retries before it releases', async () => {
  vi.useFakeTimers();
  let finishResource!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const resource = withCompanionSyncPeerRound('peer', async () => {
    entered();
    await new Promise<void>(resolve => { finishResource = resolve; });
  }, { resourceOnly: true });
  await started;
  const execute = vi.fn(async () => 'persisted');
  const data = withCompanionSyncPeerRound('peer', execute).catch(error => String(error));
  await vi.advanceTimersByTimeAsync(2500);
  expect(execute).not.toHaveBeenCalled();
  finishResource();
  await resource;
  await vi.advanceTimersByTimeAsync(1000);
  expect(await data).toBe('persisted');
  expect(execute).toHaveBeenCalledOnce();
});

it.each(['background', 'cancel'])('cancels data waiting for a resource slice on %s', async mode => {
  let entered!: () => void;
  let finish!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const resource = withCompanionSyncPeerRound('peer', async () => {
    entered();
    await new Promise<void>(resolve => { finish = resolve; });
  }, { resourceOnly: true }).catch(error => String(error));
  await started;
  const controller = new AbortController();
  const execute = vi.fn();
  const data = withCompanionSyncPeerRound('peer', execute, { signal: controller.signal });
  const outcome = data.catch(error => String(error));
  if (mode === 'background') {
    runtime.active = false;
    for (const listener of [...runtime.listeners]) listener();
  } else controller.abort(new Error('cancelled'));
  expect(await outcome).toContain(mode === 'background' ? 'foreground_ended' : 'cancelled');
  expect(execute).not.toHaveBeenCalled();
  finish();
  await resource;
  runtime.active = true;
  await expect(withCompanionSyncPeerRound('peer', async () => 'resumed', { resourceOnly: true }))
    .resolves.toBe('resumed');
});

it('releases inbound and outbound ownership on background and admits fresh foreground work', async () => {
  const owner = await companionSyncPeerRoundOwner();
  const inbound = owner.acceptInbound('incoming-peer', 'incoming-round', true);
  let entered!: () => void;
  const executing = new Promise<void>(resolve => { entered = resolve; });
  const request = withCompanionSyncPeerRound('outgoing-peer', async (_round, signal) => {
    entered();
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  const rejection = expect(request).rejects.toThrow('request_sync_foreground_ended');
  await executing;
  runtime.active = false;
  for (const listener of [...runtime.listeners]) listener();
  await rejection;
  expect(inbound.signal.aborted).toBe(true);
  expect(runtime.listeners.size).toBe(0);
  runtime.active = true;
  await expect(withCompanionSyncPeerRound('outgoing-peer', async () => 'synced')).resolves.toBe('synced');
  const fresh = await companionSyncPeerRoundOwner();
  const accepted = fresh.acceptInbound('incoming-peer', 'new-round', true);
  expect(accepted.signal.aborted).toBe(false);
  accepted.release();
});

it('rejects background work before its sync operation begins', async () => {
  runtime.active = false;
  const execute = vi.fn();
  await expect(withCompanionSyncPeerRound('peer', execute)).rejects.toThrow('request_sync_foreground_ended');
  expect(execute).not.toHaveBeenCalled();
});

it('gives data ownership before a selected attachment resumes and releases waiting resources afterward', async () => {
  let finishResource!: () => void;
  let finishData!: () => void;
  let budget: (() => boolean) | undefined;
  const order: string[] = [];
  const resource = withCompanionSyncPeerRound('peer', async () => {
    budget = attachmentWorkBudget();
    await new Promise<void>(resolve => { finishResource = resolve; });
  }, { resourceOnly: true });
  await vi.waitFor(() => expect(budget).toBeDefined());
  const data = withCompanionSyncPeerRound('peer', async () => {
    order.push('data');
    await new Promise<void>(resolve => { finishData = resolve; });
  });
  await vi.waitFor(() => expect(budget?.()).toBe(true));
  const resumed = withCompanionSyncPeerRound('peer', async () => {
    order.push('resource');
  }, { resourceOnly: true });
  finishResource();
  await resource;
  await vi.waitFor(() => expect(order).toEqual(['data']), { timeout: 2000 });
  finishData();
  await Promise.all([data, resumed]);
  expect(order).toEqual(['data', 'resource']);
});

it.each(['background', 'cancel'])('cancels a queued manual round on %s without executing after inbound release', async mode => {
  const owner = await companionSyncPeerRoundOwner();
  const inbound = owner.acceptInbound('peer', 'incoming', true);
  const controller = new AbortController();
  const execute = vi.fn(async () => 'unexpected');
  let notify!: () => void;
  const waiting = new Promise<void>(resolve => { notify = resolve; });
  const work = withCompanionSyncPeerRound('peer', execute, {
    waitForInbound: () => true, signal: controller.signal,
    onWaiting: active => { if (active) notify(); }
  });
  const outcome = work.catch(error => String(error));
  await waiting;
  if (mode === 'background') {
    runtime.active = false;
    for (const listener of [...runtime.listeners]) listener();
  } else controller.abort(new Error('cancelled'));
  owner.finishInbound('peer', 'incoming');
  expect(await outcome).toContain(mode === 'background' ? 'foreground_ended' : 'cancelled');
  expect(execute).not.toHaveBeenCalled();
  expect(inbound.signal.aborted).toBe(true);
});
