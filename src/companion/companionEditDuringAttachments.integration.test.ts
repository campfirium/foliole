// @vitest-environment node
import { randomBytes } from 'node:crypto';

import { expect, it, vi } from 'vitest';

import { readDesktopFramedSyncLibraryEvidence } from '../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { waitForAttachmentWorkYield } from '../../lib/core/sync/attachmentWorkBudget.js';
import { createMemberSyncCadence } from '../../lib/core/sync/memberSyncCadence.js';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';
import { runCompanionHighValueMutationTask, subscribeCompanionHighValueMutation }
  from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { createCompanionRequestFixture, native } from '../test/companionRequestSync.testSupport';

import { clearRetryTimer, createForegroundSyncRunner, type ForegroundSyncReason } from './companionForegroundSyncRunner';
import { loadActiveCompanionSyncRun } from './companionSyncRunOwner';
import { tryForegroundAutoSyncTarget } from './companionSyncTargetFlow';
import { runCompanionStreamSync } from './companionWorkspaceSyncFlow';

const view = vi.hoisted(() => ({ state: {
  endpoint_url: 'http://peer', last_synced_at: null, remembered_targets: [], sync_events: [],
  sync_onboarding_status: 'completed', workspace_snapshot: null
} satisfies NativeCompanionWorkspaceSyncState, epoch: '' }));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  bindCompanionWorkspaceSyncTarget: async () => undefined,
  saveCompanionWorkspaceSyncEndpoint: async () => view.state,
  loadCompanionWorkspaceSyncState: async () => view.state,
  recordCompanionWorkspaceSyncEvent: async () => view.state
}));
vi.mock('../shared/platform/companion/network/companionSyncGroupMemberState', () => ({
  exchangeCompanionSyncGroupMemberState: async () => ({ normalSyncReady: true, peerLibraryEpoch: view.epoch })
}));
vi.mock('./companionReviewSchedulerSettingsHydration', () => ({ hydrateCompanionReviewSchedulerSettings: async () => undefined }));
vi.mock('./companionSystemEntryDisplayNamesHydration', () => ({ hydrateCompanionSystemEntryDisplayNames: async () => undefined }));

const NODE = 't326-edit-during-download';
const desktopBody = (databasePath: string) => (readDesktopFramedSyncLibraryEvidence(databasePath).nodes as
  Array<{ id: string; content: string }>).find(node => node.id === NODE)?.content;

it('pushes a phone edit made while a large attachment downloads before that download finishes', { meta: { calibratedMs: 90_000 } }, async () => {
  const host = await createCompanionRequestFixture();
  const { fixture } = host;
  const retryTimer = { current: null as ReturnType<typeof setTimeout> | null };
  let cancelled = false;
  const attachmentStarts: number[] = [];
  const unsubscribe: Array<() => void> = [];
  try {
    const runtime = await import('../shared/platform/companionWorkspaceRuntimeRepository');
    vi.spyOn(runtime, 'beginNativeCompanionSyncRun').mockResolvedValue({ reason: 'automatic', run_id: 'test', runtime: 'ios' });
    vi.spyOn(runtime, 'isAvailableNativeCompanionRuntime').mockReturnValue(true);
    view.epoch = `${fixture.rightSnapshot.deviceId}-epoch`;
    view.state.endpoint_url = fixture.rightSnapshot.origin;
    const target = { endpointUrl: fixture.rightSnapshot.origin, deviceId: fixture.rightSnapshot.deviceId,
      groupId: 't326-group', protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version };
    await fixture.left.seed({ nodeId: NODE, title: 'Phone note', content: 'Before the download' });
    const runner = createForegroundSyncRunner({ cancelled: () => cancelled, setError: vi.fn(), setState: vi.fn(),
      setSyncProgress: vi.fn(), setStatus: vi.fn(), inFlightRef: { current: false },
      isAppActiveRef: { current: true }, isSyncGroupReadyRef: { current: true },
      lastCheckedAtRef: { current: 0 }, lastForegroundAtRef: { current: 0 },
      readAppActiveState: async () => true, resourceContinuationModeRef: { current: 'full' },
      retryAttemptRef: { current: 0 }, retryTimerRef: retryTimer, stateRef: { current: view.state },
      tryForegroundAutoSync: args => tryForegroundAutoSyncTarget(args, target, runCompanionStreamSync) });
    expect(await tryForegroundAutoSyncTarget({ cancelled: () => false, setError: vi.fn(), setState: vi.fn(),
      setSyncProgress: vi.fn(), setStatus: vi.fn(), state: view.state, triggerReason: 'manual' }, target, runCompanionStreamSync))
      .toBe('completed');
    expect(desktopBody(fixture.rightSnapshot.databasePath)).toBe('Before the download');

    // A phone on a busy LAN: every attachment exchange takes a while, as on the device.
    await fixture.right.seedResource({ includeImageInBody: true, nodeId: 't326-large-picture',
      bytes: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(40 * 1024 * 1024)]) });
    native.post.mockImplementation(async input => {
      if (new URL(input.url).searchParams.get('request') === 'attachments') {
        attachmentStarts.push(Date.now());
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      return host.post(input);
    });
    const cadence = createMemberSyncCadence<ForegroundSyncReason>({ didSync: result => result === undefined,
      getActiveRun: () => loadActiveCompanionSyncRun()?.completion ?? null,
      holdPendingMutation: waitForAttachmentWorkYield, run: reason => runner(reason) });
    unsubscribe.push(() => cadence.stop(), subscribeCompanionHighValueMutation(() => { void cadence.requestMutation('mutation'); }));
    cadence.updateFreshness({ eligible: true, input: 'freshness' });
    void cadence.requestImmediate('foreground');
    await vi.waitFor(() => expect(attachmentStarts.length).toBeGreaterThanOrEqual(2), { timeout: 20_000 });

    // The phone's save order: the write waits in the shared writer queue, then announces the edit.
    const editedAt = Date.now();
    await runCompanionHighValueMutationTask(() => fixture.left.seed({ nodeId: NODE, title: 'Phone note',
      content: 'Edited while downloading' }), { kind: 'nodes', nodeIds: [NODE] });
    await vi.waitFor(() => expect(desktopBody(fixture.rightSnapshot.databasePath)).toBe('Edited while downloading'),
      { timeout: 60_000, interval: 25 });
    const arrivedAt = Date.now();
    // The waiting edit goes out first: no new attachment exchange starts after it beyond one already being prepared.
    expect(attachmentStarts.filter(at => at > editedAt && at < arrivedAt).length).toBeLessThanOrEqual(1);
    const startsBeforeArrival = attachmentStarts.length;
    await vi.waitFor(() => expect(attachmentStarts.length).toBeGreaterThan(startsBeforeArrival), { timeout: 30_000 });
  } finally {
    cancelled = true;
    unsubscribe.forEach(stop => stop());
    clearRetryTimer(retryTimer);
    vi.restoreAllMocks();
    await host.close();
  }
});
