// @vitest-environment node
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { createFramedSyncFileSessionNoncePort } from '../../lib/core/sync/framedSyncFileSession.js';
import { readFramedSyncOverwriteInventory, readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { receiveRequestSyncObject, sendRequestSyncObject, type RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { runRequestSyncOverwriteRound } from '../../lib/core/sync/requestSyncOverwriteRound.js';
import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadSyncGroupOverwriteProgress, prepareSyncGroupOverwrite } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { loadLatestSyncGroupRestoreEvent, receiveSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

const progress = { groupId: 'group', overwriteId: 'new-epoch', providerDeviceId: 'peer',
  providerLibraryEpoch: 'peer-epoch', receiverDeviceId: 'local', receiverLibraryEpoch: 'new-epoch' };
const inbound = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  senderDeviceId: 'peer', senderLibraryEpoch: 'peer-epoch', receiverDeviceId: 'local', receiverLibraryEpoch: 'new-epoch' } as const;
const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  initiatorDeviceId: 'local', initiatorLibraryEpoch: 'new-epoch', responderDeviceId: 'peer', responderLibraryEpoch: 'peer-epoch' } as const;

it.each(['adoption', 'restore'] as const)('resumes %s without clearing accepted objects or publishing partial state', async mode => {
  const source = textDevice(); const target = textDevice();
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/request-sync-overwrite-'));
  try {
    seed(target, 'local'); seed(source, 'peer');
    await target.receive([textBranch('obsolete', 'Obsolete library')]);
    for (const id of ['first', 'second']) {
      const record = textBranch(`${id}-v1`, id);
      await source.receive([{ ...record, object_id: id, snapshot: { ...record.snapshot, id } }]);
    }
    if (mode === 'adoption') await beginSyncGroupLocalAdoption(target.db, {
      groupId: 'group', libraryEpoch: 'new-epoch', providerDeviceId: 'peer',
      providerDeviceName: 'Peer', providerPlatform: 'mac', endpointUrl: 'http://localhost:1'
    });
    else await receiveSyncGroupRestoreEvent(target.db, { group_id: 'group', restore_id: 'new-epoch',
      source_device_identity_key: 'peer', restored_at: new Date().toISOString() });
    expect((await prepareSyncGroupOverwrite(target.db, progress)).cleared).toBe(true);
    const local = host(target, path.join(root, 'target'));
    const remote = host(source, path.join(root, 'source'));
    const round = roundPort(target, source, local, remote);
    let interrupted = false;
    await expect(runRequestSyncOverwriteRound(local, progress, { ...round,
      transferObject: async difference => {
        await round.transferObject(difference);
        if (!interrupted) { interrupted = true; throw new Error('connection_lost_after_commit'); }
      }
    })).rejects.toThrow('connection_lost_after_commit');
    expect(await loadSyncGroupOverwriteProgress(target.db)).toEqual(progress);
    const partial = await target.db.query('SELECT id FROM nodes ORDER BY id');
    expect(partial).not.toHaveLength(0);
    expect((await prepareSyncGroupOverwrite(target.db, progress)).cleared).toBe(false);
    expect(await target.db.query('SELECT id FROM nodes ORDER BY id')).toEqual(partial);
    expect(await readRequestSyncInventorySnapshot(target.db)).toEqual([]);
    expect(await target.db.query("SELECT * FROM node_version_member_positions WHERE device_identity_key = 'local'"))
      .toEqual([]);
    target.sqlite.exec(`CREATE TRIGGER reject_recovery_finish BEFORE INSERT ON node_version_member_positions
      WHEN NEW.device_identity_key = 'local' BEGIN SELECT RAISE(ABORT, 'finish_position_failure'); END`);
    await expect(runRequestSyncOverwriteRound(local, progress, round)).rejects.toThrow('finish_position_failure');
    expect(await loadSyncGroupOverwriteProgress(target.db)).toEqual(progress);
    expect(await readRequestSyncInventorySnapshot(target.db)).toEqual([]);
    target.sqlite.exec('DROP TRIGGER reject_recovery_finish');
    expect((await runRequestSyncOverwriteRound(local, progress, round)).complete).toBe(true);
    expect(await loadSyncGroupOverwriteProgress(target.db)).toBeNull();
    expect(await loadSyncGroupLocalAdoption(target.db)).toBeNull();
    if (mode === 'restore') expect((await loadLatestSyncGroupRestoreEvent(target.db, 'group'))?.applied).toBe(true);
    expect(await target.db.query('SELECT id FROM nodes ORDER BY id')).toEqual([{ id: 'first' }, { id: 'second' }]);
    expect(await target.db.query("SELECT object_id FROM node_version_member_positions WHERE device_identity_key = 'local' ORDER BY object_id"))
      .toEqual([{ object_id: 'first' }, { object_id: 'second' }]);
  } finally { source.sqlite.close(); target.sqlite.close(); await rm(root, { recursive: true }); }
});

function host(device: ReturnType<typeof textDevice>, root: string): RequestSyncDatabaseHost {
  const files = createDesktopFramedSyncFiles(root);
  return { files, noncePort: createFramedSyncFileSessionNoncePort(files),
    readSnapshot: read => device.db.transaction(read), write: write => write(device.db) };
}

function roundPort(target: ReturnType<typeof textDevice>, source: ReturnType<typeof textDevice>,
  local: RequestSyncDatabaseHost, remote: RequestSyncDatabaseHost) {
  return {
    exchangeInventory: async () => ({ local: await readFramedSyncOverwriteInventory(target.db, inbound),
      remote: await readRequestSyncInventorySnapshot(source.db) }),
    transferObject: async (difference: import('../../lib/core/sync/framedSyncInventory.js').FramedSyncInventoryDifference) => {
      expect(difference.direction).toBe('remote_to_local');
      const groupKey = new Uint8Array(32).fill(7);
      return sendRequestSyncObject(remote, { context, groupKey, difference: { ...difference, direction: 'local_to_remote' } },
        stream => receiveRequestSyncObject(local, { context, groupKey, ...stream, author: 'responder',
          expectedObject: difference, peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: 'peer',
            library_epoch: 'peer-epoch', proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null } }));
    },
    reportObjectError: (_difference: unknown, error: unknown) => { throw error; }
  };
}

function seed(device: ReturnType<typeof textDevice>, id: string) {
  device.sqlite.prepare("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')").run();
  device.sqlite.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')").run(id);
  device.sqlite.prepare('UPDATE node_version_local_proof_state SET library_epoch = ?').run(`${id}-epoch`);
  device.sqlite.exec(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
    device_name, platform, state, joined_at, updated_at) VALUES
    ('group', 'peer', 'peer', '/peer', 'Peer', 'mac', 'active', 'now', 'now'),
    ('group', 'local', 'local', '/local', 'Local', 'mac', 'active', 'now', 'now')`);
}
