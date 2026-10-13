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
  const events: ReturnType<typeof notification>[] = [];
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
    events.push(payload as ReturnType<typeof notification>);
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
    deleted = true;
    expect(await round(source, target, targetHost)).toMatchObject({ complete: true, pending: 0 });
    expect(events.filter(event => event.appliedNodeIds.length > 0)).toEqual([notification(), notification()]);
    const deliveredEvents = [...events];
    target.reopen();
    expect(await round(source, target, targetHost)).toMatchObject({ complete: true, pending: 0, transferred: 0 });
    expect(events).toEqual(deliveredEvents);
  } finally { osBoundary.send = () => {}; await fixture.close(); }
});

function notification() {
  return { appliedNodeIds: ['topic'], appliedObjectIds: ['topic'], appliedReviewOpIds: [] };
}

function round(source: RestorePeer, target: RestorePeer, targetHost: RequestSyncDatabaseHost) {
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
          results.push({ requestId: new Uint8Array(16), globalId: difference.globalId, objectType: difference.objectType,
            error: error instanceof Error ? error.message : String(error) });
        }
      }
      return results;
    }, reportObjectError: (_difference, error) => { throw error; }
  });
}
