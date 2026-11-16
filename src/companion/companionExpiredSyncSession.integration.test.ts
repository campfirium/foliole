// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { readDesktopFramedSyncLibraryEvidence } from '../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';
import { createCompanionRequestFixture, native } from '../test/companionRequestSync.testSupport.js';
import { installSessionHttpBoundary } from '../test/companionSessionHttp.testSupport.js';

import { clearRetryTimer, createForegroundSyncRunner } from './companionForegroundSyncRunner';
import { tryForegroundAutoSyncTarget } from './companionSyncTargetFlow';
import { runCompanionStreamSync } from './companionWorkspaceSyncFlow';

const view = vi.hoisted(() => ({ epoch: '', events: vi.fn(), state: {
  endpoint_url: null, last_synced_at: null, remembered_targets: [], sync_events: [],
  sync_onboarding_status: 'completed', workspace_snapshot: null
} as NativeCompanionWorkspaceSyncState }));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  bindCompanionWorkspaceSyncTarget: async () => undefined,
  saveCompanionWorkspaceSyncEndpoint: async () => view.state,
  loadCompanionWorkspaceSyncState: async () => view.state,
  loadCompanionWorkspaceDisplayState: async () => view.state,
  recordCompanionWorkspaceSyncEvent: view.events
}));
vi.mock('../shared/platform/companion/network/companionSyncGroupMemberState', () => ({
  exchangeCompanionSyncGroupMemberState: async () => ({ normalSyncReady: true, peerLibraryEpoch: view.epoch })
}));
vi.mock('../shared/platform/companion/network/signedRequest.js', () => ({
  createSignedRequestHeaders: async (input: { method: string; pathWithQuery: string }) =>
    (await native.sign({ method: input.method, path_with_query: input.pathWithQuery, sync_group_id: 't326-group' })).headers
}));
vi.mock('./companionReviewSchedulerSettingsHydration', () => ({ hydrateCompanionReviewSchedulerSettings: async () => undefined }));
vi.mock('./companionSystemEntryDisplayNamesHydration', () => ({ hydrateCompanionSystemEntryDisplayNames: async () => undefined }));

it.each(['inventory', 'attachments', 'round_finish'])('lets a desktop session end at %s and resumes through existing scheduling',
  { meta: { calibratedMs: 30_000 } }, async operation => {
    const { closeCompanionDesktopSession, companionDesktopSessionId, ensureCompanionDesktopSession, subscribeCompanionDesktopChanges } =
      await import('../shared/platform/companion/network/companionDesktopSession.js');
    const host = await createCompanionRequestFixture();
    installSessionHttpBoundary();
    const retryTimer = { current: null as ReturnType<typeof setTimeout> | null };
    const { fixture } = host;
    const target = { endpointUrl: fixture.rightSnapshot.origin, deviceId: fixture.rightSnapshot.deviceId,
      groupId: 't326-group', platform: 'darwin', protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version };
    view.epoch = `${target.deviceId}-epoch`;
    view.state.endpoint_url = target.endpointUrl;
    view.events.mockReset().mockResolvedValue(view.state);
    let cancelled = false;
    const unsubscribe = subscribeCompanionDesktopChanges(async () => {});
    try {
      const runtime = await import('../shared/platform/companionWorkspaceRuntimeRepository.js');
      vi.spyOn(runtime, 'beginNativeCompanionSyncRun').mockResolvedValue({ reason: 'initial', run_id: 'test', runtime: 'ios' });
      vi.spyOn(runtime, 'isAvailableNativeCompanionRuntime').mockReturnValue(true);
      const callbacks = { cancelled: () => cancelled, setError: vi.fn(), setState: vi.fn(),
        setSyncProgress: vi.fn(), setStatus: vi.fn(), state: view.state };
      const runSync = vi.fn((args: Parameters<typeof tryForegroundAutoSyncTarget>[0]) =>
        tryForegroundAutoSyncTarget(args, target, runCompanionStreamSync));
      await fixture.right.seed({ nodeId: 't326-session-already-received', title: 'Before', content: 'Already committed' });
      await ensureCompanionDesktopSession(target.endpointUrl, target.deviceId, { target, libraryEpoch: view.epoch });
      await expect(host.sync()).resolves.toMatchObject({ remainingStructureChangeCount: 0 });
      const old = companionDesktopSessionId(target.deviceId)!;
      expect(old).toEqual(expect.any(String));
      view.events.mockClear();
      callbacks.setError.mockClear();
      const bytes = Buffer.from('picture');
      const resource = await fixture.right.seedResource({ nodeId: 't326-session-after-expiry', bytes, includeImageInBody: true });
      await fixture.left.seed({ nodeId: 't326-session-mobile-edit', title: 'Mobile', content: 'Still pending' });
      const { rejected, completed } = rejectOneSessionRequest(host, { ...target, old, operation });
      const runner = createForegroundSyncRunner({ ...callbacks, ...foregroundRefs(retryTimer), tryForegroundAutoSync: runSync });
      await runner('foreground');
      expect(rejected).toEqual([operation]);
      expect(await runSync.mock.results[0]?.value).toBe('session-ended');
      expect(companionDesktopSessionId(target.deviceId)).toBeUndefined();
      expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id='t326-session-already-received'").pluck().get())
        .toBe('Already committed');
      expect(view.events.mock.calls.map(([event]) => event.status)).toEqual(['started', 'skipped']);
      expect(callbacks.setError.mock.calls.filter(([error]) => error !== null)).toEqual([]);
      await vi.waitFor(async () => {
        expect(runSync).toHaveBeenCalledTimes(2);
        expect(await runSync.mock.results[1]?.value).toBe('completed');
      }, { timeout: 8000 });
      const replacement = companionDesktopSessionId(target.deviceId);
      expect(replacement).toEqual(expect.any(String));
      expect(replacement).not.toBe(old);
      expect(completed).toEqual([replacement]);
      await expectPersistedSync(host, resource.storageKey, bytes);
    } finally {
      cancelled = true;
      clearRetryTimer(retryTimer);
      await closeCompanionDesktopSession();
      unsubscribe();
      vi.restoreAllMocks();
      await host.close();
    }
  });

function rejectOneSessionRequest(host: Awaited<ReturnType<typeof createCompanionRequestFixture>>,
  target: { endpointUrl: string; old: string; operation: string }) {
  const rejected: string[] = [];
  const completed: string[] = [];
  native.post.mockImplementation(async input => {
    const url = new URL(input.url);
    const operation = url.searchParams.get('request')!;
    const session = url.searchParams.get('sync_session_id')!;
    if (operation === target.operation && session === target.old && !rejected.length) {
      const { requestCompanionSyncSession } = await import('../shared/platform/companion/network/companionSyncSessionHttp.js');
      await requestCompanionSyncSession(target.endpointUrl, { operation: 'close', session });
      try { return await host.post(input); }
      catch (error) {
        expect(String(error)).toContain('request_sync_http_409:{"error":"sync_session_expired"}');
        rejected.push(operation);
        throw new Error('framed_sync_http_409:sync_session_expired', { cause: error });
      }
    }
    const result = await host.post(input);
    if (operation === 'round_finish') completed.push(session);
    return result;
  });
  return { rejected, completed };
}

function foregroundRefs(retryTimerRef: { current: ReturnType<typeof setTimeout> | null }): Pick<
  Parameters<typeof createForegroundSyncRunner>[0],
  'inFlightRef' | 'isAppActiveRef' | 'isSyncGroupReadyRef' | 'lastCheckedAtRef' | 'lastForegroundAtRef' |
  'readAppActiveState' | 'resourceContinuationModeRef' | 'retryAttemptRef' | 'retryTimerRef' | 'stateRef'> {
  return { inFlightRef: { current: false }, isAppActiveRef: { current: true }, isSyncGroupReadyRef: { current: true },
    lastCheckedAtRef: { current: 0 }, lastForegroundAtRef: { current: 0 }, readAppActiveState: async () => true,
    resourceContinuationModeRef: { current: 'full' }, retryAttemptRef: { current: 0 },
    retryTimerRef, stateRef: { current: view.state } };
}

async function expectPersistedSync(host: Awaited<ReturnType<typeof createCompanionRequestFixture>>,
  storageKey: string, bytes: Buffer) {
  const { leftSnapshot, rightSnapshot } = host.fixture;
  for (const snapshot of [leftSnapshot, rightSnapshot]) {
    const ids = ['t326-session-already-received', 't326-session-after-expiry', 't326-session-mobile-edit'];
    expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes)
      .toEqual(expect.arrayContaining(ids.map(id => expect.objectContaining({ id }))));
  }
  await expect(readFile(path.join(leftSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', storageKey))).resolves.toEqual(bytes);
}
