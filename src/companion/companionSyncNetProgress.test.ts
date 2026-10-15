import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { FramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventory';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound';

import { createSyncObjectsResult, createSyncState, resetCompanionWorkspaceSyncFlowMocks,
  syncObjectsMock } from './companionWorkspaceSyncFlow.testHarness';

beforeEach(resetCompanionWorkspaceSyncFlowMocks);
afterEach(() => vi.useRealTimers());

it('backs off changing inventories with constant differences and leaves manual sync available between rounds', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
  let revision = 0;
  let received = 0;
  let converged = false;
  const entry = (value: number): FramedSyncInventoryEntry => ({ globalId: 'ping-pong', objectType: 'node',
    frontierFactIds: [`version-${value}`], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [],
    sharedStateHash: new Uint8Array(32).fill(value % 2) });
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementation(async () => {
    const result = await runRequestSyncDatabaseRound({
      exchangeInventory: async () => ({ local: [entry(revision)], remote: [entry(converged ? revision : revision + 1)] }),
      transferObjects: async differences => {
        revision++;
        received += differences.length;
        return differences.map(difference => ({ requestId: new Uint8Array(16), objectType: difference.objectType,
          globalId: difference.globalId, error: '' }));
      },
      reportObjectError: () => { throw new Error('unexpected_object_error'); }
    });
    return createSyncObjectsResult({ madeDatabaseProgress: result.madeProgress,
      appliedObjectIds: ['ping-pong'], remainingStructureChangeCount: result.pending });
  });
  const { createForegroundSyncRunner } = await import('./companionForegroundSyncRunner');
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
  const automatic = vi.fn(tryForegroundAutoSync);
  const setStatus = vi.fn();
  const state = createSyncState();
  const inFlightRef = { current: false };
  const callbacks = { cancelled: () => false, setError: vi.fn(), setState: vi.fn(),
    setSyncProgress: vi.fn(), setStatus, state };
  const runner = createForegroundSyncRunner({ ...callbacks, inFlightRef,
    isAppActiveRef: { current: true }, isSyncGroupReadyRef: { current: true },
    lastCheckedAtRef: { current: 0 }, lastForegroundAtRef: { current: 0 },
    readAppActiveState: async () => true, resourceContinuationModeRef: { current: 'full' },
    retryAttemptRef: { current: 0 }, retryTimerRef: { current: null }, stateRef: { current: state },
    tryForegroundAutoSync: automatic });
  await runner('foreground');
  for (const [index, delay] of [2_000, 5_000, 15_000, 30_000, 60_000].entries()) {
    expect(await automatic.mock.results[index]?.value).toBe('pending');
    expect(inFlightRef.current).toBe(false);
    expect(setStatus).toHaveBeenLastCalledWith('idle');
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(automatic).toHaveBeenCalledTimes(index + 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(automatic).toHaveBeenCalledTimes(index + 2);
  }
  expect(received).toBeGreaterThan(0);
  converged = true;
  expect(await tryForegroundAutoSync({ ...callbacks, triggerReason: 'manual' })).toBe('completed');
  expect(automatic).toHaveBeenCalledTimes(6);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(await automatic.mock.results[6]?.value).toBe('completed');
  expect(vi.getTimerCount()).toBe(0);
});
