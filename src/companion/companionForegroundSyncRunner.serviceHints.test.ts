import { expect, it, vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  isAvailableNativeCompanionRuntime: () => true
}));

import { createForegroundSyncRunner } from './companionForegroundSyncRunner';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const state = (endpointUrl: string): NativeCompanionWorkspaceSyncState => ({
  endpoint_url: endpointUrl,
  last_synced_at: null,
  remembered_targets: [endpointUrl],
  sync_events: [],
  sync_onboarding_status: 'completed',
  workspace_snapshot: null
});

it('retains one pending fact-change hint for every endpoint during an active sync', async () => {
  const initial = deferred<'completed'>();
  const tryForegroundAutoSync = vi.fn()
    .mockReturnValueOnce(initial.promise)
    .mockResolvedValue('completed');
  const endpointA = 'http://192.168.0.10:38641';
  const endpointC = 'http://192.168.0.11:38641';
  const runner = createForegroundSyncRunner({
    cancelled: () => false,
    inFlightRef: { current: false },
    isAppActiveRef: { current: true },
    isSyncGroupReadyRef: { current: true },
    lastCheckedAtRef: { current: 0 },
    lastForegroundAtRef: { current: 0 },
    pendingForegroundRef: { current: false },
    pendingServiceHintRef: { current: new Set<string>() },
    readAppActiveState: vi.fn(async () => true),
    resourceContinuationModeRef: { current: 'full' },
    retryAttemptRef: { current: 0 },
    retryTimerRef: { current: null },
    setError: vi.fn(),
    setReadableArticle: vi.fn(),
    setState: vi.fn(),
    setSyncProgress: vi.fn(),
    setStatus: vi.fn(),
    stateRef: { current: state(endpointA) },
    tryForegroundAutoSync
  });

  runner('endpoint-ready');
  runner('service-hint', endpointC);
  runner('service-hint', endpointA);
  runner('service-hint', endpointC);
  initial.resolve('completed');

  await vi.waitFor(() => expect(tryForegroundAutoSync).toHaveBeenCalledTimes(3));
  expect(tryForegroundAutoSync.mock.calls.map(([args]) => args.state.endpoint_url))
    .toEqual([endpointA, endpointC, endpointA]);
});
