// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

const osBoundary = vi.hoisted(() => ({ send: (() => {}) as (channel: string, payload: unknown) => void }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false,
  webContents: { send: (channel: string, payload: unknown) => osBoundary.send(channel, payload) } }] },
app: { getPath: () => '/tmp/foliole-notification-test-unused', isPackaged: false } }));

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import { receiveRequestSyncObject, sendRequestSyncObject, type RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';
import { restoreFixture, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { createDesktopRequestSyncDatabaseHost } from './desktopRequestSyncDatabaseHost.js';

it('notifies committed node and tombstone identities once across normal repeated rounds', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  const events: import('../ipc/contracts.js').WorkspaceSyncAppliedEvent[] = [];
  let deleted = false;
  osBoundary.send = (channel, payload) => {
    expect(channel).toBe('foliole:workspace-sync-applied');
    const persisted = new Database(target.file, { readonly: true });
    try {
      expect(persisted.prepare("SELECT content FROM nodes WHERE id = 'topic'").get())
        .toEqual(deleted ? undefined : { content: 'Original body😀' });
      expect(persisted.prepare("SELECT version_id FROM node_sync_tombstones WHERE node_id = 'topic'").get())
        .toEqual(deleted ? { version_id: 'deleted-version' } : undefined);
    } finally { persisted.close(); }
    events.push(payload as import('../ipc/contracts.js').WorkspaceSyncAppliedEvent);
  };
  const targetHost = { ...createDesktopRequestSyncDatabaseHost(target.file), ...target.host };
  try {
    const original = textBranch('original-version', 'Original body😀');
    await applySyncNodesWithDbPort(source.db, [original]);
    expect(await round(source, target, targetHost)).toMatchObject({ complete: true, pending: 0 });
    expect(events).toEqual([notification()]);
    expect(await round(source, target, targetHost)).toMatchObject({ complete: true, pending: 0, transferred: 0 });
    expect(events).toEqual([notification()]);
    const record = textBranch('deleted-version', original.body_text!, original, '2026-10-13T00:00:00Z');
    record.is_tombstone = true; record.snapshot.deleted_at = '2026-10-13T00:00:00Z';
    record.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(record.snapshot), content: record.body_text! });
    await source.db.transaction(async tx => {
      await upsertRemoteVersion(tx, record);
      await applyRemoteNodeTombstone(tx, record, false);
    });
    expect(await collectNodeVersionPayloads(source.db, 'topic')).toEqual({ released: 1, skipped: null });
    deleted = true;
    expect(await round(source, target, targetHost)).toMatchObject({ complete: true, pending: 0 });
    expect(events.filter(event => event.appliedNodeIds.length > 0)).toEqual([notification(), notification()]);
    const deliveredEvents = [...events];
    target.reopen();
    expect(await round(source, target, targetHost)).toMatchObject({ complete: true, pending: 0, transferred: 0 });
    expect(events).toEqual(deliveredEvents);
  } finally { osBoundary.send = () => {}; await fixture.close(); }
});

it('waits after a durable object commit and resumes remaining objects after reopening', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  let reached!: () => void;
  const committed = new Promise<void>(resolve => { reached = resolve; });
  let interrupt!: (reason: Error) => void;
  const held = new Promise<void>((_resolve, reject) => { interrupt = reject; });
  const controller = new AbortController();
  const desktopHost = createDesktopRequestSyncDatabaseHost(target.file);
  const host = { ...desktopHost, ...target.host,
    objectApplied: async (object: Parameters<NonNullable<RequestSyncDatabaseHost['objectApplied']>>[0]) => {
      await desktopHost.objectApplied?.(object);
      if (object.globalId === 'sync-from-zero-a-first') { reached(); await held; }
    } };
  try {
    await source.seed('sync-from-zero-a-first'); await source.seed('sync-from-zero-a-second');
    for (const id of ['sync-from-zero-a-first', 'sync-from-zero-a-second']) {
      expect(await collectNodeVersionPayloads(source.db, id)).toEqual({ released: 1, skipped: null });
    }
    const running = round(source, target, host, controller.signal);
    const interrupted = expect(running).rejects.toThrow('acceptance_process_interrupted');
    await committed;
    const read = () => {
      const connection = new Database(target.file, { readonly: true });
      try { return ['nodes', 'node_sync_versions', 'node_sync_version_parents'].map(table =>
        connection.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()); }
      finally { connection.close(); }
    };
    const before = read();
    expect(target.sqlite.prepare("SELECT id FROM nodes WHERE id LIKE 'sync-from-zero-a-%'").all())
      .toEqual([{ id: 'sync-from-zero-a-first' }]);
    controller.abort(new Error('acceptance_process_interrupted'));
    interrupt(controller.signal.reason);
    await interrupted;
    target.reopen(); expect(read()).toEqual(before);
    expect(await round(source, target, { ...desktopHost, ...target.host })).toMatchObject({ complete: true, pending: 0 });
    expect(target.sqlite.prepare('SELECT version_id, content_hash, body_text FROM node_sync_versions ORDER BY version_id').all())
      .toEqual(source.sqlite.prepare('SELECT version_id, content_hash, body_text FROM node_sync_versions ORDER BY version_id').all());
    expect(await round(source, target, { ...desktopHost, ...target.host })).toMatchObject({ transferred: 0 });
  } finally { interrupt(new Error('acceptance_process_interrupted')); await fixture.close(); }
});

function notification() {
  return expect.objectContaining({ appliedNodeIds: ['topic'], appliedObjectIds: ['topic'], appliedReviewOpIds: [],
    libraryScope: expect.any(String), workspaceScope: expect.objectContaining({ kind: expect.stringMatching(/^(nodes|full)$/u) }) });
}

function round(source: RestorePeer, target: RestorePeer, targetHost: RequestSyncDatabaseHost, signal?: AbortSignal) {
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: source.id, initiatorLibraryEpoch: source.epoch,
    responderDeviceId: target.id, responderLibraryEpoch: target.epoch } as const;
  const groupKey = new Uint8Array(32).fill(7);
  return runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: await readRequestSyncInventorySnapshot(source.db),
      remote: await readRequestSyncInventorySnapshot(target.db) }),
    transferObjects: async differences => {
      const results = [];
      for (const difference of differences) {
        signal?.throwIfAborted();
        const from = difference.direction === 'local_to_remote' ? source : target;
        const to = difference.direction === 'local_to_remote' ? target : source;
        const boundContext = { ...context, initiatorDeviceId: from.id, initiatorLibraryEpoch: from.epoch,
          responderDeviceId: to.id, responderLibraryEpoch: to.epoch };
        try {
          const result = await sendRequestSyncObject(from.host, { context: boundContext, groupKey,
            difference: { ...difference, direction: 'local_to_remote' } }, stream =>
            receiveRequestSyncObject(to === target ? targetHost : source.host, { context: boundContext, groupKey,
              ...stream, author: 'initiator', expectedObject: difference,
              peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: from.id,
                library_epoch: from.epoch, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null } }));
          results.push({ requestId: result.requestId, globalId: difference.globalId, objectType: difference.objectType, error: '' });
        } catch (error) {
          signal?.throwIfAborted();
          results.push({ requestId: new Uint8Array(16), globalId: difference.globalId, objectType: difference.objectType,
            error: error instanceof Error ? error.message : String(error) });
        }
      }
      return results;
    }, reportObjectError: (_difference, error) => { throw error; }
  }, signal);
}
