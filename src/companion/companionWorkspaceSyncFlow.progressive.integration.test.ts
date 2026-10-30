// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract';
import { invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import * as capabilities from '../shared/platform/companionRuntimeCapabilities';
import { createCompanionRequestFixture, native } from '../test/companionRequestSync.testSupport';

import type { runCompanionStreamSync as RunSync } from './companionWorkspaceSyncFlow';

vi.mock('../shared/platform/appLifecycle', () => ({
  readNativeAppActiveState: async () => true,
  subscribeNativeAppEnteredBackground: async () => () => undefined,
  subscribeNativeAppBackground: async () => () => undefined
}));

vi.mock('./companionReviewSchedulerSettingsHydration', () => ({ hydrateCompanionReviewSchedulerSettings: async () => undefined }));
vi.mock('./companionSystemEntryDisplayNamesHydration', () => ({ hydrateCompanionSystemEntryDisplayNames: async () => undefined }));

it('shows committed directory and body changes while real attachment HTTP is still pending', { meta: { calibratedMs: 30000 } }, async () => {
  invalidateCompanionReadingScope();
  const host = await createCompanionRequestFixture();
  const { runCompanionStreamSync } = await import('./companionWorkspaceSyncFlow');
  const { loadCompanionDisplaySnapshotState } = await import('../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSyncStateStore');
  const ownerCleanup = await useSerializedOwner(host);
  const capability = vi.spyOn(capabilities, 'getCompanionRuntimeCapability').mockReturnValue({ kind: 'ios-native', platform: 'ios' });
  let release!: () => void;
  const attachmentGate = new Promise<void>(resolve => { release = resolve; });
  let attachmentStarted = false;
  let finished = false;
  let state!: NativeCompanionWorkspaceSyncState;
  let run: ReturnType<typeof RunSync> | undefined;
  const deferredRefreshes: Array<() => void> = [];
  try {
    await host.fixture.right.seed({ nodeId: 'reading-topic', title: 'Reading topic', content: 'Original body' });
    await host.sync();
    state = await loadCompanionDisplaySnapshotState();
    expect(state.workspace_snapshot?.nodesById['reading-topic']).toBeDefined();
    expect(state.workspace_snapshot?.nodesById['incoming-topic']).toBeUndefined();
    await host.fixture.right.seed({ nodeId: 'reading-topic', title: 'Reading topic', content: 'Updated body' });
    const resource = await host.fixture.right.seedResource({ nodeId: 'incoming-topic',
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), includeImageInBody: true });
    native.post.mockImplementation(async input => {
      if (new URL(input.url).searchParams.get('request') === 'attachments') {
        attachmentStarted = true;
        await attachmentGate;
      }
      return host.post(input);
    });
    run = runCompanionStreamSync({
      cancelled: () => false, endpointUrl: host.fixture.rightSnapshot.origin,
      framedPeer: { deviceId: host.fixture.rightSnapshot.deviceId,
        libraryEpoch: `${host.fixture.rightSnapshot.deviceId}-epoch`, protocolVersion: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version },
      runId: 'progressive-display', startedAt: new Date().toISOString(), triggerReason: 'manual',
      workspaceSnapshot: state.workspace_snapshot, setStatus: vi.fn(), setSyncProgress: vi.fn(), setError: vi.fn(),
      deferAfterRelease: work => deferredRefreshes.push(work),
      setState: update => { state = typeof update === 'function' ? update(state) : update; }
    }).finally(() => { finished = true; });
    await vi.waitFor(() => expect(attachmentStarted, JSON.stringify(state.sync_events)).toBe(true), { timeout: 5000 });
    expect(finished).toBe(false);
    expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id = 'reading-topic'").pluck().get()).toBe('Updated body');
    await vi.waitFor(() => assertVisibleChanges(state, host));
    expect(finished).toBe(false);
    release();
    await run;
    deferredRefreshes.splice(0).forEach(work => work());
    await assertPersistedConvergence(host, resource.storageKey);
  } finally {
    release();
    await run;
    deferredRefreshes.splice(0).forEach(work => work());
    await vi.waitFor(() => assertVisibleChanges(state, host));
    await ownerCleanup();
    capability.mockRestore();
    invalidateCompanionReadingScope();
    await host.close();
  }
});

async function useSerializedOwner(host: Awaited<ReturnType<typeof createCompanionRequestFixture>>) {
  const { createDisplayLibrary } = await import('../shared/platform/companion/sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport');
  const { getIosCompanionDatabaseOwner } = await import('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap');
  const library = createDisplayLibrary('ios', host.fixture.leftSnapshot.databasePath);
  host.sqlite.pragma(`user_version = ${COMPANION_DATABASE_VERSION}`);
  host.sqlite.prepare("INSERT INTO companion_meta VALUES ('device_id', ?, 'now')").run(host.fixture.leftSnapshot.deviceId);
  await library.owner.open({ expectedHostName: 'Mobile', allowCreate: false, now: '2026-10-30T00:00:00.000Z' });
  const owner = getIosCompanionDatabaseOwner();
  const spies = [
    vi.spyOn(owner, 'runWriter').mockImplementation(library.owner.runWriter.bind(library.owner)),
    vi.spyOn(owner, 'read').mockImplementation(library.owner.read.bind(library.owner)),
    vi.spyOn(owner, 'readSnapshot').mockImplementation(library.owner.readSnapshot.bind(library.owner))
  ];
  return async () => {
    spies.forEach(spy => spy.mockRestore());
    await library.close();
  };
}

async function assertPersistedConvergence(host: Awaited<ReturnType<typeof createCompanionRequestFixture>>, storageKey: string) {
  const source = new Database(host.fixture.rightSnapshot.databasePath, { readonly: true });
  const receiver = new Database(host.fixture.leftSnapshot.databasePath, { readonly: true });
  try {
    const sql = 'SELECT id, content, current_version_id FROM nodes WHERE id IN (?, ?) ORDER BY id';
    expect(receiver.prepare(sql).all('reading-topic', 'incoming-topic'))
      .toEqual(source.prepare(sql).all('reading-topic', 'incoming-topic'));
    expect(receiver.prepare("SELECT content FROM nodes WHERE id = 'reading-topic'").pluck().get()).toBe('Updated body');
  } finally { receiver.close(); source.close(); }
  expect(await fs.readFile(path.join(host.fixture.leftSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', storageKey)))
    .toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
}

function assertVisibleChanges(state: NativeCompanionWorkspaceSyncState,
  host: Awaited<ReturnType<typeof createCompanionRequestFixture>>) {
  expect(state.workspace_snapshot?.nodesById['incoming-topic']).toBeDefined();
  expect(state.workspace_snapshot?.nodeOrder).toContain('incoming-topic');
  expect(state.workspace_snapshot?.nodesById['reading-topic']?.currentVersionId)
    .toBe(host.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'reading-topic'").pluck().get());
}
