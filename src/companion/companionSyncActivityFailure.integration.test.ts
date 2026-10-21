// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { readDesktopFramedSyncLibraryEvidence } from '../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';
import { createCompanionRequestFixture } from '../test/companionRequestSync.testSupport';

import { tryForegroundAutoSyncTarget } from './companionSyncTargetFlow';
import { runCompanionStreamSync, tryForegroundAutoSync } from './companionWorkspaceSyncFlow';

const runtime = vi.hoisted(() => ({ epoch: '', resolve: vi.fn(), complete: vi.fn(async () => undefined),
  record: vi.fn(async () => { throw new Error('activity_storage_unavailable'); }) }));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  resolveReachableCompanionWorkspaceSyncEndpoints: runtime.resolve,
  bindCompanionWorkspaceSyncTarget: async () => undefined,
  saveCompanionWorkspaceSyncEndpoint: async () => undefined,
  recordCompanionWorkspaceSyncEvent: runtime.record,
  loadCompanionWorkspaceSyncState: async () => ({ workspace_snapshot: null }),
  loadCompanionWorkspaceDisplayState: async () => ({ workspace_snapshot: null })
}));
vi.mock('../shared/platform/companion/network/companionSyncGroupMemberState', () => ({
  exchangeCompanionSyncGroupMemberState: async () => ({ normalSyncReady: true, peerLibraryEpoch: runtime.epoch })
}));
vi.mock('../shared/platform/companion/network/companionDesktopSession.js', async importOriginal => ({
  ...await importOriginal<typeof import('../shared/platform/companion/network/companionDesktopSession.js')>(),
  captureCompanionDesktopRound: () => runtime.complete,
  ensureCompanionDesktopSession: async () => undefined,
  waitForCompanionDesktopChanges: () => undefined
}));
vi.mock('./companionReviewSchedulerSettingsHydration', () => ({ hydrateCompanionReviewSchedulerSettings: async () => undefined }));
vi.mock('./companionSystemEntryDisplayNamesHydration', () => ({ hydrateCompanionSystemEntryDisplayNames: async () => undefined }));

it('persists both directions and reports completion even when both activity writes fail', { meta: { calibratedMs: 60_000 } }, async () => {
  const host = await createCompanionRequestFixture();
  const { fixture } = host;
  try {
    const bridge = await import('../shared/platform/companionWorkspaceRuntimeRepository');
    vi.spyOn(bridge, 'beginNativeCompanionSyncRun').mockResolvedValue({ reason: 'manual', run_id: 'test', runtime: 'ios' });
    runtime.epoch = `${fixture.rightSnapshot.deviceId}-epoch`;
    await fixture.left.seed({ nodeId: 't326-activity-mobile', title: 'Mobile', content: 'Mobile edit' });
    await fixture.right.seed({ nodeId: 't326-activity-desktop', title: 'Desktop', content: 'Desktop edit' });
    const setError = vi.fn();
    const outcome = await tryForegroundAutoSyncTarget({ cancelled: () => false, setError,
      setState: vi.fn(), setStatus: vi.fn(), setSyncProgress: vi.fn(), triggerReason: 'manual', state: {
        endpoint_url: fixture.rightSnapshot.origin, last_synced_at: null, remembered_targets: [],
        sync_events: [], sync_onboarding_status: 'completed', workspace_snapshot: null
      }
    }, { endpointUrl: fixture.rightSnapshot.origin, deviceId: fixture.rightSnapshot.deviceId,
      protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version }, runCompanionStreamSync);
    expect(outcome, JSON.stringify(setError.mock.calls)).toBe('completed');
    expect(runtime.record).toHaveBeenCalledTimes(2);
    expect(runtime.complete).toHaveBeenCalledOnce();
    expect(host.sqlite.prepare("SELECT value FROM companion_meta WHERE key = 'workspace_sync_last_synced_at'").pluck().get()).toEqual(expect.any(String));
    expect(setError).toHaveBeenLastCalledWith('sync_activity_unavailable');
    for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
      expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 't326-activity-mobile', content: 'Mobile edit' }),
        expect.objectContaining({ id: 't326-activity-desktop', content: 'Desktop edit' })
      ]));
    }
  } finally { vi.restoreAllMocks(); await host.close(); }
});


it('persists a new desktop-bound change while independent mobile discovery remains pending', { meta: { calibratedMs: 60_000 } }, async () => {
  const host = await createCompanionRequestFixture();
  const { fixture } = host;
  let finishDiscovery!: (targets: []) => void;
  const discovery = new Promise<[]>(resolve => { finishDiscovery = resolve; });
  let cancelled = false;
  let first: Promise<unknown> | undefined;
  try {
    const bridge = await import('../shared/platform/companionWorkspaceRuntimeRepository');
    vi.spyOn(bridge, 'beginNativeCompanionSyncRun').mockResolvedValue({ reason: 'automatic', run_id: 'test', runtime: 'ios' });
    runtime.epoch = `${fixture.rightSnapshot.deviceId}-epoch`;
    const target = { endpointUrl: fixture.rightSnapshot.origin, deviceId: fixture.rightSnapshot.deviceId,
      protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version };
    runtime.resolve.mockImplementationOnce(async (_endpoint, options) => { options.onSessionReused(); return [target]; })
      .mockImplementationOnce(() => discovery).mockResolvedValue([target]);
    const args = { cancelled: () => cancelled, setError: vi.fn(), setState: vi.fn(),
      setStatus: vi.fn(), setSyncProgress: vi.fn(), state: {
        endpoint_url: target.endpointUrl, last_synced_at: null, remembered_targets: [],
        sync_events: [], sync_onboarding_status: 'completed' as const, workspace_snapshot: null
      } };
    let firstResult: unknown;
    first = tryForegroundAutoSync({ ...args, discoverMobilePeers: true }).then(result => { firstResult = result; });
    await vi.waitFor(() => expect(firstResult).toBe('completed'), { timeout: 3000 });
    expect(runtime.resolve).toHaveBeenCalledTimes(2);
    await fixture.left.seed({ nodeId: 't326-edit-during-discovery', title: 'New edit', content: 'No discovery delay' });
    await expect(tryForegroundAutoSync(args)).resolves.toBe('completed');
    for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
      expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 't326-edit-during-discovery', content: 'No discovery delay' })
      ]));
    }
  } finally {
    cancelled = true;
    finishDiscovery([]);
    await first?.catch(() => undefined);
    vi.restoreAllMocks();
    await host.close();
  }
});
