// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { applyRequestSyncObject, type RequestSyncObjectInput } from '../../lib/core/sync/requestSyncObjectApply.js';
import { prepareSyncGroupOverwrite } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { receiveSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => { for (const host of devices.splice(0)) host.sqlite.close(); });

function receiver() {
  const host = textDevice();
  devices.push(host);
  host.sqlite.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'local', 'active', 'now');
    UPDATE node_version_local_proof_state SET library_epoch = 'local-epoch';
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', 'peer', 'peer-anchor', '/peer', 'Peer', 'mac', 'active', 'now', 'now'),
      ('group', 'local', 'local-anchor', '/local', 'Local', 'mac', 'active', 'now', 'now')`);
  return host;
}

function request(): RequestSyncObjectInput {
  const base = textBranch('base', 'Original');
  const head = textBranch('head', 'Current', base);
  const projections = [base, head].map(record => projectFramedSyncNodeRecord(record));
  return {
    context: { groupId: 'group', senderDeviceId: 'peer', senderLibraryEpoch: 'peer-epoch',
      receiverDeviceId: 'local', receiverLibraryEpoch: 'local-epoch', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION },
    peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: 'peer',
      library_epoch: 'peer-epoch', proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
    objectType: 'node', globalId: 'topic', requestId: new Uint8Array(16).fill(1),
    facts: async function* () { for (const value of projections) yield* value.manifest.facts; },
    loadBody: async (_db, blob) => {
      const projection = projections.find(value => value.manifest.blobs.some(candidate =>
        candidate.sha256.every((byte, index) => byte === blob.sha256[index])));
      if (!projection) throw new Error('test_body_missing');
      return projection.bodyBlob;
    }
  };
}

it('commits business facts, source progress, peer epoch together without delivery rows', async () => {
  const host = receiver();
  const input = request();
  await applyRequestSyncObject(host.db, input);
  expect((await host.current()).body_text).toBe('Current');
  expect(await host.db.query('SELECT source_device_identity_key FROM node_version_local_source_revisions'))
    .toEqual([{ source_device_identity_key: 'peer' }]);
  expect(await host.db.query('SELECT library_epoch FROM node_version_device_revisions'))
    .toEqual([{ library_epoch: 'peer-epoch' }]);
  const progress = await host.db.query('SELECT source_device_identity_key FROM node_version_local_source_revisions');
  await applyRequestSyncObject(host.db, input);
  expect((await host.current()).version_id).toBe('head');
  expect(await host.db.query('SELECT source_device_identity_key FROM node_version_local_source_revisions')).toEqual(progress);
  for (const table of ['framed_sync_outbound_publications', 'framed_sync_inbound_transfers',
    'framed_sync_receipts', 'sync_delivery_receipts', 'node_version_inbound_receipts']) {
    expect(await host.db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table])).toEqual([]);
  }
});

it('rolls back the entire object when source progress fails, then retries normally', async () => {
  const host = receiver();
  host.sqlite.exec(`CREATE TRIGGER reject_test_progress BEFORE INSERT ON node_version_local_source_revisions
    BEGIN SELECT RAISE(ABORT, 'injected_progress_failure'); END`);
  await expect(applyRequestSyncObject(host.db, request())).rejects.toThrow('injected_progress_failure');
  for (const table of ['nodes', 'node_sync_versions', 'node_version_local_source_revisions', 'node_version_device_revisions']) {
    expect(await host.db.query(`SELECT count(*) AS count FROM ${table}`)).toEqual([{ count: 0 }]);
  }
  host.sqlite.exec('DROP TRIGGER reject_test_progress');
  await applyRequestSyncObject(host.db, request());
  expect((await host.current()).version_id).toBe('head');
});

it('does not retire a known epoch merely because a request declares a different one', async () => {
  const host = receiver();
  host.sqlite.exec("INSERT INTO node_version_device_revisions VALUES ('group', 'peer', 'old', 0, 'business', NULL, 'now')");
  await expect(applyRequestSyncObject(host.db, request())).rejects.toThrow('node_version_peer_restore_requires_rejoin');
  expect(await host.db.query('SELECT library_epoch FROM node_version_device_revisions')).toEqual([{ library_epoch: 'old' }]);
  expect(await host.db.query('SELECT id FROM nodes')).toEqual([]);
});

it('rolls back facts and progress when cancellation arrives during the object transaction', async () => {
  const host = receiver();
  const controller = new AbortController();
  host.sqlite.function('cancel_request', () => {
    controller.abort(new Error('request_cancelled_before_commit'));
    return 1;
  });
  host.sqlite.exec(`CREATE TRIGGER cancel_test_progress AFTER INSERT ON node_version_local_source_revisions
    BEGIN SELECT cancel_request(); END`);
  await expect(applyRequestSyncObject(host.db, { ...request(), signal: controller.signal }))
    .rejects.toThrow('request_cancelled_before_commit');
  for (const table of ['nodes', 'node_sync_versions', 'node_version_local_source_revisions', 'node_version_device_revisions']) {
    expect(await host.db.query(`SELECT count(*) AS count FROM ${table}`)).toEqual([{ count: 0 }]);
  }
  host.sqlite.exec('DROP TRIGGER cancel_test_progress');
  await applyRequestSyncObject(host.db, request());
  expect((await host.current()).version_id).toBe('head');
});


it('accepts the approved overwrite source after a peer proof changes during reception', async () => {
  const host = receiver();
  const input = request();
  await receiveSyncGroupRestoreEvent(host.db, { group_id: 'group', restore_id: 'local-epoch',
    source_device_identity_key: 'peer', restored_at: '2026-10-12T00:00:00.000Z' });
  await prepareSyncGroupOverwrite(host.db, { groupId: 'group', overwriteId: 'local-epoch',
    providerDeviceId: 'peer', providerLibraryEpoch: 'peer-epoch',
    receiverDeviceId: 'local', receiverLibraryEpoch: 'local-epoch' });
  host.sqlite.exec("INSERT INTO node_version_device_revisions VALUES ('group', 'peer', 'peer-epoch', 9, 'acknowledged', NULL, 'now')");
  await applyRequestSyncObject(host.db, input);
  expect((await host.current()).body_text).toBe('Current');
  expect(await host.db.query("SELECT object_id FROM sync_object_state WHERE object_type = 'node_position'")).toEqual([]);
  expect(await host.db.query('SELECT proof_revision FROM node_version_device_revisions'))
    .toEqual([{ proof_revision: 9 }]);
  await expect(applyRequestSyncObject(host.db, { ...input,
    context: { ...input.context, senderLibraryEpoch: 'unapproved-epoch' },
    peerState: { ...input.peerState, library_epoch: 'unapproved-epoch' } }))
    .rejects.toThrow('sync_group_overwrite_source_changed');
});

it('applies an authorized request when another exchange advances the same peer proof', async () => {
  const host = receiver();
  const authorized = request();
  host.sqlite.exec("INSERT INTO node_version_device_revisions VALUES ('group', 'peer', 'peer-epoch', 9, 'acknowledged', NULL, 'now')");
  await applyRequestSyncObject(host.db, authorized);
  expect((await host.current()).body_text).toBe('Current');
  expect(await host.db.query('SELECT proof_revision FROM node_version_device_revisions'))
    .toEqual([{ proof_revision: 9 }]);
  expect(await host.db.query("SELECT object_id FROM sync_object_state WHERE object_type = 'node_position'")).toEqual([]);
});
