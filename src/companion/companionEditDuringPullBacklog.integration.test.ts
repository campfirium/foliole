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
// About 150 ms for each pulled note of this size, as measured on the Android test phone.
const APPLY_MS_PER_BYTE = 0.03;
const desktopBody = (databasePath: string) => (readDesktopFramedSyncLibraryEvidence(databasePath).nodes as
  Array<{ id: string; content: string }>).find(node => node.id === NODE)?.content;

it.each([
  ['while a pull batch applies', 'pulls'],
  ['right after its pass read the local inventory', 'inventory']
] as const)('pushes a phone edit made %s before a large desktop backlog is fully applied', { meta: { calibratedMs: 120_000 } }, async (_when, trigger) => {
  const host = await createCompanionRequestFixture();
  const { fixture } = host;
  const retryTimer = { current: null as ReturnType<typeof setTimeout> | null };
  let cancelled = false;
  let edited: Promise<number> | null = null;
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
    const edit = () => runCompanionHighValueMutationTask(() => fixture.left.seed({ nodeId: NODE, title: 'Phone note',
      content: 'Edited while the backlog applies' }), { kind: 'nodes', nodeIds: [NODE] }).then(() => Date.now());
    // Applying pulled notes is what takes time on the phone, in proportion to what a pull brings back.
    native.post.mockImplementation(async input => {
      const kind = new URL(input.url).searchParams.get('request');
      // An inventory request carries a local inventory already read, so an edit now lands after that read.
      if (kind === trigger && !edited) { edited = edit(); if (kind === 'inventory') await edited; }
      const reply = await host.post(input);
      if (kind === 'pulls') await new Promise(resolve => setTimeout(resolve, reply.response_byte_length * APPLY_MS_PER_BYTE));
      return reply;
    });
    unsubscribe.push(startPhoneScheduling(target, retryTimer, () => cancelled));
    await vi.waitFor(() => expect(edited).not.toBeNull(), { timeout: 20_000 });
    const editedAt = await edited!;
    await vi.waitFor(() => expect(desktopBody(fixture.rightSnapshot.databasePath)).toBe('Edited while the backlog applies'),
      { timeout: 60_000, interval: 25 });
    expect(Date.now() - editedAt).toBeLessThan(4000);
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

/** The phone app's own wiring: foreground runner, member cadence and high-value edit notifications. */
function startPhoneScheduling(target: Parameters<typeof tryForegroundAutoSyncTarget>[1],
  retryTimer: { current: ReturnType<typeof setTimeout> | null }, cancelled: () => boolean) {
  const runner = createForegroundSyncRunner({ cancelled, setError: vi.fn(), setState: vi.fn(),
    setSyncProgress: vi.fn(), setStatus: vi.fn(), inFlightRef: { current: false },
    isAppActiveRef: { current: true }, isSyncGroupReadyRef: { current: true },
    lastCheckedAtRef: { current: 0 }, lastForegroundAtRef: { current: 0 },
    readAppActiveState: async () => true, resourceContinuationModeRef: { current: 'full' },
    retryAttemptRef: { current: 0 }, retryTimerRef: retryTimer, stateRef: { current: view.state },
    tryForegroundAutoSync: args => tryForegroundAutoSyncTarget(args, target, runCompanionStreamSync) });
  const cadence = createMemberSyncCadence<ForegroundSyncReason>({ didSync: result => result === undefined,
    getActiveRun: () => loadActiveCompanionSyncRun()?.completion ?? null,
    holdPendingMutation: waitForAttachmentWorkYield, run: reason => runner(reason) });
  const stopEdits = subscribeCompanionHighValueMutation(() => { void cadence.requestMutation('mutation'); });
  cadence.updateFreshness({ eligible: true, input: 'freshness' });
  void cadence.requestImmediate('foreground');
  return () => { cadence.stop(); stopEdits(); };
}
