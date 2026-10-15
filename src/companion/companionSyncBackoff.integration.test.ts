// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { buildDesktopFramedSyncFixture, readDesktopFramedSyncLibraryEvidence } from '../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { createCompanionRequestFixture, native } from '../test/companionRequestSync.testSupport';

import { clearRetryTimer, createForegroundSyncRunner } from './companionForegroundSyncRunner';
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

it('releases a busy automatic round and lets a manual production round persist both directions during backoff', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-t351-'));
  const script = path.join(root, 'fixture.mjs');
  await buildDesktopFramedSyncFixture(script, true);
  const host = await createCompanionRequestFixture(script);
  const { fixture } = host;
  const retryTimer = { current: null as ReturnType<typeof setTimeout> | null };
  let cancelled = false;
  try {
    const runtime = await import('../shared/platform/companionWorkspaceRuntimeRepository');
    vi.spyOn(runtime, 'beginNativeCompanionSyncRun').mockResolvedValue({ reason: 'automatic', run_id: 'test', runtime: 'ios' });
    vi.spyOn(runtime, 'isAvailableNativeCompanionRuntime').mockReturnValue(true);
    view.epoch = `${fixture.rightSnapshot.deviceId}-epoch`;
    const target = { endpointUrl: fixture.rightSnapshot.origin, deviceId: fixture.rightSnapshot.deviceId,
      groupId: 't326-group', protocolVersion: 25 };
    view.state.endpoint_url = target.endpointUrl;
    await fixture.left.seed({ nodeId: 't326-backoff-mobile-edit', title: 'Mobile', content: 'Saved on mobile' });
    await fixture.right.seed({ nodeId: 't326-backoff-desktop-edit', title: 'Desktop', content: 'Saved on desktop' });
    await fixture.right.invoke('activation_hold_round', { peerId: fixture.leftSnapshot.deviceId });
    const callbacks = { cancelled: () => cancelled, setError: vi.fn(), setState: vi.fn(),
      setSyncProgress: vi.fn(), setStatus: vi.fn(), state: view.state };
    const automatic = vi.fn((args: Parameters<typeof tryForegroundAutoSyncTarget>[0]) =>
      tryForegroundAutoSyncTarget(args, target, runCompanionStreamSync));
    const runner = createForegroundSyncRunner({ ...callbacks, inFlightRef: { current: false },
      isAppActiveRef: { current: true }, isSyncGroupReadyRef: { current: true },
      lastCheckedAtRef: { current: 0 }, lastForegroundAtRef: { current: 0 },
      readAppActiveState: async () => true, resourceContinuationModeRef: { current: 'full' },
      retryAttemptRef: { current: 0 }, retryTimerRef: retryTimer, stateRef: { current: view.state },
      tryForegroundAutoSync: automatic });
    await runner('foreground');
    expect(callbacks.setError.mock.calls.filter(([error]) => error !== null)).toEqual([]);
    expect(await automatic.mock.results[0]?.value).toBe('pending');
    expect(retryTimer.current).not.toBeNull();
    await fixture.right.invoke('activation_release_round');
    expect(await tryForegroundAutoSyncTarget({ ...callbacks, triggerReason: 'manual' }, target, runCompanionStreamSync))
      .toBe('completed');
    expect(automatic).toHaveBeenCalledOnce();
    for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
      expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 't326-backoff-mobile-edit', content: 'Saved on mobile' }),
        expect.objectContaining({ id: 't326-backoff-desktop-edit', content: 'Saved on desktop' })
      ]));
    }
  } finally {
    cancelled = true;
    clearRetryTimer(retryTimer);
    vi.restoreAllMocks();
    await host.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}, 60_000);

it('distinguishes a committed neighbor from repeated unchanged pending and resumes after the source is available', async () => {
  const host = await createCompanionRequestFixture();
  const { fixture } = host;
  const sync = () => runCompanionStreamSync({ cancelled: () => false,
    endpointUrl: fixture.rightSnapshot.origin, framedPeer: { deviceId: fixture.rightSnapshot.deviceId,
      libraryEpoch: `${fixture.rightSnapshot.deviceId}-epoch`, protocolVersion: 25 },
    runId: crypto.randomUUID(), startedAt: new Date().toISOString(), triggerReason: 'automatic',
    workspaceSnapshot: null, setState: vi.fn(), setStatus: vi.fn(), setSyncProgress: vi.fn() });
  try {
    for (const nodeId of ['t326-backoff-unavailable', 't326-backoff-neighbor']) {
      await fixture.left.seed({ nodeId, title: nodeId, content: 'Original' });
    }
    expect(await sync()).toBe('completed');
    await fixture.left.seed({ nodeId: 't326-backoff-unavailable', title: 'Unavailable', content: 'Saved edit' });
    await fixture.left.seed({ nodeId: 't326-backoff-neighbor', title: 'Neighbor', content: 'Available edit' });
    const update = host.sqlite.prepare(`UPDATE node_sync_versions SET body_text = ?,
      snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id =
      (SELECT current_version_id FROM nodes WHERE id = 't326-backoff-unavailable')`);
    update.run(null);
    expect(await sync()).toBe('backlog');
    expect(await sync()).toBe('pending');
    expect(await sync()).toBe('pending');
    expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).nodes)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 't326-backoff-unavailable', content: 'Original' }),
        expect.objectContaining({ id: 't326-backoff-neighbor', content: 'Available edit' })
      ]));
    update.run('Saved edit');
    expect(await sync()).toBe('completed');
    for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
      expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes)
        .toContainEqual(expect.objectContaining({ id: 't326-backoff-unavailable', content: 'Saved edit' }));
    }
  } finally { await host.close(); }
}, 30_000);


it('backs off real transfers when concurrent edits keep differences from shrinking, then persists convergence', async () => {
  const host = await createCompanionRequestFixture();
  const { fixture } = host;
  const nodeId = 't326-backoff-changing-source';
  let revision = 0;
  let editing = true;
  const sync = () => runCompanionStreamSync({ cancelled: () => false,
    endpointUrl: fixture.rightSnapshot.origin, framedPeer: { deviceId: fixture.rightSnapshot.deviceId,
      libraryEpoch: `${fixture.rightSnapshot.deviceId}-epoch`, protocolVersion: 25 },
    runId: crypto.randomUUID(), startedAt: new Date().toISOString(), triggerReason: 'automatic',
    workspaceSnapshot: null, setState: vi.fn(), setStatus: vi.fn(), setSyncProgress: vi.fn() });
  try {
    await fixture.right.seed({ nodeId, title: 'Changing source', content: `Revision ${revision}` });
    native.post.mockImplementation(async input => {
      const response = await host.post(input);
      if (editing && new URL(input.url).searchParams.get('request') === 'pulls') {
        await fixture.right.seed({ nodeId, title: 'Changing source', content: `Revision ${++revision}` });
      }
      return response;
    });
    for (let round = 0; round < 3; round++) {
      const before = revision;
      expect(await sync()).toBe('pending');
      expect(revision).toBeGreaterThan(before);
      expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes)
        .toContainEqual(expect.objectContaining({ id: nodeId, content: `Revision ${revision - 1}` }));
    }
    editing = false;
    expect(await sync()).toBe('completed');
    for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
      expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes)
        .toContainEqual(expect.objectContaining({ id: nodeId, content: `Revision ${revision}` }));
    }
  } finally { await host.close(); }
}, 30_000);
