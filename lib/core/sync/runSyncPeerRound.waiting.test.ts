import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { runSyncPeerRound } from './runSyncPeerRound.js';
import { createSyncPeerRoundOwnership } from './syncPeerRoundOwnership.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('hands the released peer to the waiting manual round before a new inbound start', async () => {
  const owner = createSyncPeerRoundOwnership(5000);
  const inbound = owner.acceptInbound('desktop', 'incoming', true);
  const execute = vi.fn(async () => 'complete');
  const onWaiting = vi.fn();
  const input = { owner, peerId: 'desktop', execute, waitForInbound: () => true, onWaiting };
  const work = runSyncPeerRound(input);
  const outcome = work.then(value => value, error => String(error));
  await vi.advanceTimersByTimeAsync(2000);
  expect(execute).not.toHaveBeenCalled();
  expect(onWaiting).toHaveBeenCalledWith(true);
  let competingError = '';
  inbound.signal.addEventListener('abort', () => {
    try { owner.acceptInbound('desktop', 'immediate-next', true); }
    catch (error) { competingError = String(error); }
  });
  owner.finishInbound('desktop', 'incoming');
  expect(competingError).toContain('sync_round_busy');
  expect(await outcome).toBe('complete');
  expect(onWaiting.mock.calls).toEqual([[true], [false]]);
  owner.close();
});

it('ends waiting at the existing deadline even when the inbound keeps renewing, using its single timer', async () => {
  const owner = createSyncPeerRoundOwnership(5000);
  const inbound = owner.acceptInbound('desktop', 'incoming', true);
  const execute = vi.fn();
  const input = { owner, peerId: 'desktop', execute, waitForInbound: () => true };
  const outcome = runSyncPeerRound(input).catch(error => String(error));
  await vi.advanceTimersByTimeAsync(4000);
  inbound.touch();
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await outcome).toContain('sync_round_wait_expired');
  expect(inbound.signal.aborted).toBe(false);
  expect(execute).not.toHaveBeenCalled();
  owner.finishInbound('desktop', 'incoming');
  expect(owner.acquireOutbound('desktop', 'after-timeout')).not.toBeNull();
  owner.close();
});

it.each(['cancel', 'close', 'cancel-after-grant', 'close-after-grant'])('does not execute late work after %s', async mode => {
  const owner = createSyncPeerRoundOwnership(5000);
  const inbound = owner.acceptInbound('desktop', 'incoming', true);
  const controller = new AbortController();
  const execute = vi.fn();
  const input = { owner, peerId: 'desktop', execute, waitForInbound: () => true, signal: controller.signal };
  const outcome = runSyncPeerRound(input).catch(error => String(error));
  if (mode === 'close' || mode === 'close-after-grant') {
    if (mode === 'close-after-grant') owner.finishInbound('desktop', 'incoming');
    owner.close(new Error('closed'));
  }
  else {
    if (mode === 'cancel-after-grant') owner.finishInbound('desktop', 'incoming');
    controller.abort(new Error('cancelled'));
    owner.finishInbound('desktop', 'incoming');
  }
  await outcome;
  expect(execute).not.toHaveBeenCalled();
  if (!mode.startsWith('close')) expect(owner.acquireOutbound('desktop', 'after-cancel')).not.toBeNull();
  expect(inbound.signal.aborted).toBe(true);
  owner.close();
});

it('uses manual intent received during an automatic busy retry without dropping the click', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const owner = createSyncPeerRoundOwnership(5000);
  owner.acceptInbound('desktop', 'incoming', true);
  let manualRequested = false;
  const onWaiting = vi.fn();
  const work = runSyncPeerRound({ owner, peerId: 'desktop',
    waitForInbound: () => manualRequested, onWaiting, execute: async () => 'complete' });
  await vi.advanceTimersByTimeAsync(0);
  manualRequested = true;
  await vi.advanceTimersByTimeAsync(100);
  expect(onWaiting).toHaveBeenCalledWith(true);
  owner.finishInbound('desktop', 'incoming');
  expect(await work).toBe('complete');
  owner.close();
});
