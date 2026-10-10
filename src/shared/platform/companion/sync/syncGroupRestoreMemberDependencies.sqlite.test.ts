// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { textBranch } from '../../../../../electron/database/topicTextState.testSupport.js';
import { verifiedCompanionFixture } from '../../../../../electron/sync/companionFramedSyncVerifiedApply.testSupport.js';
import type { DbPort } from '../../../../../lib/core/sync/dbPort.js';
import { applyNodeMemberPosition } from '../../../../../lib/core/sync/nodeVersionMemberPositionApply.js';
import { nodePositionFactId } from '../../../../../lib/core/sync/nodeVersionMemberPositionFact.js';
import { finishSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor.js';
import { hashText } from '../../../../../lib/core/sync/syncNodeResolution.js';
import { createSyncGroupDeviceIdentity } from '../../../../../lib/platform/syncGroupUnifiedContract.js';

const owner = vi.hoisted(() => ({ db: null as DbPort | null }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => ({
  read: (run: (db: DbPort) => unknown) => run(owner.db!),
  runWriter: (run: (db: DbPort) => unknown) => run(owner.db!)
}) }));

import { canMergeRestoreSourceMembers } from './syncGroupMemberStateGuards.js';
import { applyCompanionSyncGroupMemberState, loadCompanionSyncGroupMemberState } from './syncGroupMemberStateStore.js';
import { joinCompanionSyncGroup } from './syncGroupStore.js';

const groupId = 'restore-group';
const identities = ['source', 'receiver', 'windows'].map((name, index) => createSyncGroupDeviceIdentity({
  device_anchor: `${index + 1}1111111-1111-4111-8111-111111111111`, group_id: groupId,
  library_path: name === 'windows' ? 'd:\\x\\foliole.db' : `/${name}/foliole.db`,
  path_flavor: name === 'windows' ? 'windows' : 'posix'
}));
const source = identities[0]!, receiver = identities[1]!, windows = identities[2]!;
const event = { group_id: groupId, restore_id: 'restore-round', restored_at: '2030-01-01T00:00:00.000Z',
  source_device_identity_key: source.identity_key };

async function joined(db: DbPort, local: typeof source, peer: typeof source) {
  owner.db = db;
  await joinCompanionSyncGroup({ mode: 'use-group', endpointUrl: 'http://fixture', device: local, deviceName: 'Fixture', displayName: 'Fixture',
    platform: 'android-capacitor', provider: { device: peer, deviceName: 'Peer', platform: 'Windows' }, workgroupKey: 'fixture-key' });
  await finishSyncGroupLocalAdoption(db, (await loadSyncGroupLocalAdoption(db))!);
}

async function pending(db: DbPort, applied: boolean) {
  await db.run(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`, [event.restore_id, groupId, event.restored_at,
    source.identity_key, applied ? event.restored_at : null, event.restored_at]);
}

it('receives a third member version declaration from the restore source and keeps restore pending after reopening', async () => {
  const sender = await verifiedCompanionFixture('android', 'Unused sender');
  const target = await verifiedCompanionFixture('android', 'Unused receiver');
  try {
    await joined(sender.port(), source, windows);
    await pending(sender.port(), true);
    const incoming = await loadCompanionSyncGroupMemberState();
    await joined(target.port(), receiver, source);
    await pending(target.port(), false);
    const version = textBranch('restored-version', 'Complete restored body', undefined, event.restored_at);
    await applySyncNodesWithDbPort(sender.port(), [version], { enqueueSearchInvalidations: false });
    await applySyncNodesWithDbPort(target.port(), [version], { enqueueSearchInvalidations: false });
    const payload = { adopted_version_id: version.version_id!, device_identity_key: windows.identity_key,
      group_id: groupId, library_epoch: 'windows-epoch', object_id: version.object_id,
      pending_version_ids_json: '[]', proof_revision: 1, updated_at: event.restored_at };
    const record = { object_type: 'node_position', object_id: nodePositionFactId(payload),
      content_hash: hashText(JSON.stringify(payload)), payload_json: JSON.stringify(payload),
      deleted_at: null, updated_at: event.restored_at };
    await expect(applyNodeMemberPosition(target.port(), record)).rejects.toThrow('node_position_member_unknown');
    const state = await applyCompanionSyncGroupMemberState(incoming, source.identity_key);
    expect(state.normal_sync_ready).toBe(false);
    expect(state.state.restore).toEqual({ event, applied: false });
    expect(await applyNodeMemberPosition(target.port(), record)).toBe(true);
    target.reopen(); owner.db = target.port();
    expect(await applyNodeMemberPosition(target.port(), record)).toBe(false);
    expect((await loadCompanionSyncGroupMemberState()).restore).toEqual({ event, applied: false });
    expect(target.main.prepare('SELECT adopted_version_id FROM node_version_member_positions').all())
      .toEqual([{ adopted_version_id: version.version_id }]);
    expect(target.main.prepare('SELECT content FROM nodes').all()).toEqual([{ content: version.body_text }]);
  } finally { owner.db = null; sender.close(); target.close(); }
});

it.each(['source', 'event', 'timestamp', 'applied', 'adoption', 'epoch'] as const)(
  'does not import restore member dependencies across a mismatched %s', async mismatch => {
    const target = await verifiedCompanionFixture('android', 'Unused');
    try {
      await joined(target.port(), receiver, source);
      await pending(target.port(), false);
      const local = await loadCompanionSyncGroupMemberState();
      const incoming = { ...local, sender_device_identity_key: source.identity_key,
        restore: { event: { ...event }, applied: true } };
      if (mismatch === 'source') incoming.sender_device_identity_key = windows.identity_key;
      if (mismatch === 'event') incoming.restore.event.restore_id = 'other-round';
      if (mismatch === 'timestamp') incoming.restore.event.restored_at = '2029-01-01T00:00:00.000Z';
      if (mismatch === 'applied') incoming.restore.applied = false;
      if (mismatch === 'adoption') incoming.adopting_from = windows.identity_key;
      if (mismatch === 'epoch') {
        await target.port().run("INSERT INTO sync_group_metadata VALUES ('sync_group_overwrite_progress', ?, ?)",
          [JSON.stringify({ groupId, overwriteId: event.restore_id, providerDeviceId: source.identity_key,
            providerLibraryEpoch: 'different-epoch', receiverDeviceId: receiver.identity_key,
            receiverLibraryEpoch: event.restore_id }), event.restored_at]);
        await expect(canMergeRestoreSourceMembers(target.port(), incoming, local.restore, receiver.identity_key))
          .rejects.toThrow('sync_group_overwrite_source_changed');
      } else expect(await canMergeRestoreSourceMembers(target.port(), incoming, local.restore, receiver.identity_key)).toBe(false);
      expect((await loadCompanionSyncGroupMemberState()).devices).toHaveLength(2);
    } finally { owner.db = null; target.close(); }
  });

it('rolls back source membership metadata when a relayed device identity is invalid', async () => {
  const sender = await verifiedCompanionFixture('android', 'Unused sender');
  const target = await verifiedCompanionFixture('android', 'Unused receiver');
  try {
    await joined(sender.port(), source, windows);
    await pending(sender.port(), true);
    const incoming = await loadCompanionSyncGroupMemberState();
    incoming.devices.find(device => device.device_identity_key === windows.identity_key)!
      .canonical_library_path = '/different/foliole.db';
    await joined(target.port(), receiver, source);
    await pending(target.port(), false);
    const before = await loadCompanionSyncGroupMemberState();
    await expect(applyCompanionSyncGroupMemberState(incoming, source.identity_key))
      .rejects.toThrow('sync_group_device_identity_mismatch');
    expect(await loadCompanionSyncGroupMemberState()).toEqual(before);
  } finally { owner.db = null; sender.close(); target.close(); }
});
