import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import {
  hydrateCompanionSyncGroupAdoptionRun,
  readCompanionSyncGroupAdoptionRun
} from '../shared/platform/companion/sync/companionSyncGroupAdoptionRun';

const runtime = vi.hoisted(() => ({
  adoption: null as null | Record<string, string>,
  adopt: vi.fn(),
  flow: vi.fn()
}));
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  isAvailableNativeCompanionRuntime: () => true
}));
vi.mock('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ read: async () => runtime.adoption })
}));
vi.mock('../shared/platform/companion/sync/completeCompanionSyncGroupAdoption', () => ({
  completeCompanionSyncGroupAdoption: runtime.adopt
}));
vi.mock('./companionWorkspaceSyncFlow', () => ({ tryForegroundAutoSync: runtime.flow }));

import { createForegroundSyncRunner } from './companionForegroundSyncRunner';
import { runCompanionSyncCoordinator } from './companionSyncCoordinator';

const noEndpoint: NativeCompanionWorkspaceSyncState = {
  endpoint_url: null, last_synced_at: null, remembered_targets: [], sync_events: [],
  sync_onboarding_status: 'completed', workspace_snapshot: null
} as never;

function args() {
  return { cancelled: () => false, setError: vi.fn(), setState: vi.fn(), setSyncProgress: vi.fn(),
    setStatus: vi.fn(), state: noEndpoint, triggerReason: 'automatic' } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  runtime.adoption = { groupId: 'group-1' };
  runtime.flow.mockResolvedValue('completed');
});

it('continues an interrupted group adoption on the next scheduled run before ordinary sync', async () => {
  await hydrateCompanionSyncGroupAdoptionRun();
  runtime.adopt.mockRejectedValueOnce(new Error('request_sync_foreground_ended'));
  await expect(runCompanionSyncCoordinator(args())).resolves.toBe('failed');
  expect(readCompanionSyncGroupAdoptionRun()).toMatchObject({ phase: 'paused' });
  expect(runtime.flow).not.toHaveBeenCalled();

  runtime.adopt.mockImplementationOnce(async (options: { onProgress(progress: unknown): void }) => {
    options.onProgress({ phase: 'structure', completed: 40, total: 60 });
    runtime.adoption = null;
  });
  await expect(runCompanionSyncCoordinator(args())).resolves.toBe('completed');
  expect(runtime.adopt).toHaveBeenCalledTimes(2);
  expect(runtime.flow).toHaveBeenCalledOnce();
  expect(readCompanionSyncGroupAdoptionRun()).toEqual({ phase: 'none' });
});

it('keeps receiving while a busy provider round is retried in the foreground', async () => {
  await hydrateCompanionSyncGroupAdoptionRun();
  runtime.adopt.mockRejectedValueOnce(new Error('framed_sync_http_400:sync_round_busy'));
  await expect(runCompanionSyncCoordinator(args())).resolves.toBe('failed');
  expect(readCompanionSyncGroupAdoptionRun()).toMatchObject({ phase: 'receiving',
    error: 'framed_sync_http_400:sync_round_busy' });
  runtime.adopt.mockImplementationOnce(async () => { runtime.adoption = null; });
  await expect(runCompanionSyncCoordinator(args())).resolves.toBe('completed');
});

it('starts a scheduled run for a pending adoption even without a saved sync endpoint', async () => {
  await hydrateCompanionSyncGroupAdoptionRun();
  const tryForegroundAutoSync = vi.fn(async () => 'completed' as const);
  const runner = createForegroundSyncRunner({
    cancelled: () => false, inFlightRef: { current: false }, isAppActiveRef: { current: true },
    isSyncGroupReadyRef: { current: true }, lastCheckedAtRef: { current: 0 }, lastForegroundAtRef: { current: 0 },
    readAppActiveState: vi.fn(async () => true), resourceContinuationModeRef: { current: 'full' },
    retryAttemptRef: { current: 0 }, retryTimerRef: { current: null }, setError: vi.fn(), setState: vi.fn(),
    setSyncProgress: vi.fn(), setStatus: vi.fn(), stateRef: { current: noEndpoint }, tryForegroundAutoSync
  });
  runner('foreground');
  await vi.waitFor(() => expect(tryForegroundAutoSync).toHaveBeenCalledOnce());
});
