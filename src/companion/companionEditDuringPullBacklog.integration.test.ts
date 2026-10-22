// @vitest-environment node
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

// Backlog IDs sort before the edited note, so inventory order alone would put the edit last.
const NODE = 't326-phone-edit';
const BACKLOG = 200;
const desktopBody = (databasePath: string) => (readDesktopFramedSyncLibraryEvidence(databasePath).nodes as
  Array<{ id: string; content: string }>).find(node => node.id === NODE)?.content;

it('pushes a phone edit made while it applies a large desktop backlog before that backlog is fully applied', { meta: { calibratedMs: 120_000 } }, async () => {
  const host = await createCompanionRequestFixture();
  const { fixture } = host;
  const retryTimer = { current: null as ReturnType<typeof setTimeout> | null };
  let cancelled = false;
  let pullStarted = false;
  const unsubscribe: Array<() => void> = [];
  const received = () => host.sqlite.prepare("SELECT count(*) FROM nodes WHERE id LIKE 't326-a-backlog-%'").pluck().get() as number;
  try {
    const runtime = await import('../shared/platform/companionWorkspaceRuntimeRepository');
    vi.spyOn(runtime, 'beginNativeCompanionSyncRun').mockResolvedValue({ reason: 'automatic', run_id: 'test', runtime: 'ios' });
    vi.spyOn(runtime, 'isAvailableNativeCompanionRuntime').mockReturnValue(true);
    view.epoch = `${fixture.rightSnapshot.deviceId}-epoch`;
    view.state.endpoint_url = fixture.rightSnapshot.origin;
    const target = { endpointUrl: fixture.rightSnapshot.origin, deviceId: fixture.rightSnapshot.deviceId,
      groupId: 't326-group', protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version };
    await fixture.left.seed({ nodeId: NODE, title: 'Phone note', content: 'Before the backlog' });
    expect(await tryForegroundAutoSyncTarget({ cancelled: () => false, setError: vi.fn(), setState: vi.fn(),
      setSyncProgress: vi.fn(), setStatus: vi.fn(), state: view.state, triggerReason: 'manual' }, target, runCompanionStreamSync))
      .toBe('completed');

    for (let index = 0; index < BACKLOG; index++) {
      await fixture.right.seed({ nodeId: `t326-a-backlog-${String(index).padStart(3, '0')}`, title: `Backlog ${index}`,
        content: `Desktop backlog ${index} `.repeat(200) });
    }
    // Applying pulled notes is what takes time on the phone; each pull exchange stands in for it.
    native.post.mockImplementation(async input => {
      if (new URL(input.url).searchParams.get('request') === 'pulls') {
        pullStarted = true;
        await new Promise(resolve => setTimeout(resolve, 600));
      }
      return host.post(input);
    });
    const runner = createForegroundSyncRunner({ cancelled: () => cancelled, setError: vi.fn(), setState: vi.fn(),
      setSyncProgress: vi.fn(), setStatus: vi.fn(), inFlightRef: { current: false },
      isAppActiveRef: { current: true }, isSyncGroupReadyRef: { current: true },
      lastCheckedAtRef: { current: 0 }, lastForegroundAtRef: { current: 0 },
      readAppActiveState: async () => true, resourceContinuationModeRef: { current: 'full' },
      retryAttemptRef: { current: 0 }, retryTimerRef: retryTimer, stateRef: { current: view.state },
      tryForegroundAutoSync: args => tryForegroundAutoSyncTarget(args, target, runCompanionStreamSync) });
    const cadence = createMemberSyncCadence<ForegroundSyncReason>({ didSync: result => result === undefined,
      getActiveRun: () => loadActiveCompanionSyncRun()?.completion ?? null,
      holdPendingMutation: waitForAttachmentWorkYield, run: reason => runner(reason) });
    unsubscribe.push(() => cadence.stop(), subscribeCompanionHighValueMutation(() => { void cadence.requestMutation('mutation'); }));
    cadence.updateFreshness({ eligible: true, input: 'freshness' });
    void cadence.requestImmediate('foreground');
    await vi.waitFor(() => expect(pullStarted).toBe(true), { timeout: 20_000 });

    await runCompanionHighValueMutationTask(() => fixture.left.seed({ nodeId: NODE, title: 'Phone note',
      content: 'Edited while the backlog applies' }), { kind: 'nodes', nodeIds: [NODE] });
    await vi.waitFor(() => expect(desktopBody(fixture.rightSnapshot.databasePath)).toBe('Edited while the backlog applies'),
      { timeout: 60_000, interval: 25 });
    expect(received()).toBeLessThan(BACKLOG);
    await vi.waitFor(() => expect(received()).toBe(BACKLOG), { timeout: 60_000 });
  } finally {
    cancelled = true;
    unsubscribe.forEach(stop => stop());
    clearRetryTimer(retryTimer);
    vi.restoreAllMocks();
    await host.close();
  }
});
