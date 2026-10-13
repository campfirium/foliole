// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { closeLibraries, createPeer, root, startLibraries } from '../../../../../../electron/database/syncEmptyLibraryTestSupport.js';
import { bootstrapCompanionDatabase } from '../../../../../../lib/core/database/companionDatabaseLifecycle.js';
import { computeSyncContentHash } from '../../../../../../lib/core/database/syncState.js';
import { buildCanonicalSettingSyncPayload } from '../../../../../../lib/core/sync/canonicalPrivateStatePayload.js';
import { buildCanonicalSyncTombstone } from '../../../../../../lib/core/sync/canonicalSyncTombstone.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import type { CanonicalFact } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { selectFramedSyncObjectStateFact } from '../../../../../../lib/core/sync/framedSyncObjectStateFact.js';
import { applyRequestSyncObject, type RequestSyncObjectInput } from '../../../../../../lib/core/sync/requestSyncObjectApply.js';
import { applySyncObjectInTransaction } from '../../../../../../lib/core/sync/syncObjectApplyExecutor.js';


beforeEach(startLibraries);
afterEach(closeLibraries);

function request(fact: CanonicalFact): RequestSyncObjectInput {
  return {
    context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch',
      receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch' },
    peerState: { contract_version: 3 as const, group_id: 'group', sender_device_identity_key: 'sender',
      library_epoch: 'sender-epoch', proof_revision: 0, devices: [], removals: [], restore: null, source_proof_revisions: {} },
    objectType: fact.objectType, globalId: fact.globalId, requestId: new Uint8Array(16),
    facts: async function* () { yield fact; },
    loadBody: async () => { throw new Error('setting_body_unexpected'); }, enqueueSearchInvalidations: false
  };
}

async function seedPrivateSetting(receiver: DbPort, kind: 'android' | 'ios') {
  const payload = buildCanonicalSettingSyncPayload({ form_factor: 'phone', host_name: 'receiver',
    key: 'discourse_publish_settings', platform: kind, scope: 'host', value_json: '{"local":true}' });
  await applySyncObjectInTransaction(receiver, { object_type: 'setting',
    object_id: `host:${kind}:phone:receiver:discourse_publish_settings`,
    content_hash: computeSyncContentHash('setting', payload), deleted_at: null,
    payload_json: JSON.stringify(payload), updated_at: '2026-10-06' }, { hostName: 'receiver' });
  return payload;
}

it.each(['android', 'ios'] as const)('applies shared settings and tombstones while preserving private settings through %s restart', async (kind) => {
  const source = createPeer('setting-source');
  const file = path.join(root, 'companion-setting.db');
  const sqlite = new Database(file);
  const receiver = createBetterSqliteDbPort(sqlite);
  try {
    await bootstrapCompanionDatabase(receiver, { allowCreate: true, expectedHostName: 'receiver', now: '2026-10-06' });
    sqlite.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
      INSERT INTO sync_group_local_state VALUES (1, 'group', 'receiver', 'active', 'now');
      UPDATE node_version_local_proof_state SET library_epoch = 'receiver-epoch';
      INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
        device_name, platform, state, joined_at, updated_at) VALUES
        ('group', 'sender', 'sender', '/sender', 'Sender', 'mac', 'active', 'now', 'now'),
        ('group', 'receiver', 'receiver', '/receiver', 'Receiver', 'mac', 'active', 'now', 'now')`);
    const privatePayload = await seedPrivateSetting(receiver, kind);
    for (const host of ['*']) {
      const id = `user_space:${kind}:phone:${host}:search_aliases_document`;
      const payload = buildCanonicalSettingSyncPayload({ form_factor: 'phone', host_name: host,
        key: 'search_aliases_document', platform: kind, scope: 'user_space', value_json: '{"server":"original.example"}' });
      const hash = computeSyncContentHash('setting', payload);
      const record = { object_type: 'setting' as const, object_id: id, content_hash: hash,
        deleted_at: null, payload_json: JSON.stringify(payload), updated_at: '2026-10-06' };
      await applySyncObjectInTransaction(source.port, record, { hostName: host });
      const apply = async (contentHash: string) => {
        const fact = await selectFramedSyncObjectStateFact(source.port,
          { globalId: id, objectType: 'setting' }, `setting:${contentHash}`);
        const input = request(fact);
        await applyRequestSyncObject(receiver, input);
        await applyRequestSyncObject(receiver, input);
        expect(await selectFramedSyncObjectStateFact(receiver,
          { globalId: id, objectType: 'setting' }, `setting:${contentHash}`)).toEqual(fact);
        return input;
      };
      const originalInput = await apply(hash);
      expect(sqlite.prepare('SELECT value_json FROM setting_records WHERE host_name = ? AND key = ?')
        .pluck().get(host, payload.key)).toBe(payload.value_json);
      const deletedHash = computeSyncContentHash('setting', buildCanonicalSyncTombstone(id));
      await applySyncObjectInTransaction(source.port, { ...record, content_hash: deletedHash,
        deleted_at: '2026-10-07', payload_json: null, updated_at: '2026-10-07' }, { hostName: host });
      await apply(deletedHash);
      await applyRequestSyncObject(receiver, originalInput);
      await applyRequestSyncObject(receiver, originalInput);
      expect(sqlite.prepare('SELECT content_hash, deleted_at FROM sync_object_state WHERE object_id = ?').get(id))
        .toEqual({ content_hash: deletedHash, deleted_at: '2026-10-07' });
      expect(sqlite.prepare('SELECT value_json FROM setting_records WHERE host_name = ? AND key = ?').get(host, payload.key)).toBeUndefined();
    }
    await bootstrapCompanionDatabase(receiver, { allowCreate: false, expectedHostName: 'receiver', now: '2026-10-08' });
    const reopened = new Database(file, { readonly: true });
    try {
      expect(reopened.prepare("SELECT name FROM sqlite_master WHERE name = 'framed_sync_receipts'").get()).toBeUndefined();
      expect(reopened.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_type = 'setting' AND deleted_at IS NOT NULL").pluck().get()).toBe(1);
      expect(reopened.prepare('SELECT value_json FROM setting_records WHERE key = ? AND host_name = ?').pluck().get(privatePayload.key, 'receiver')).toBe(privatePayload.value_json);
      expect(reopened.prepare("SELECT value FROM companion_meta WHERE key = 'host_name'").pluck().get()).toBe('receiver');
    } finally { reopened.close(); }
  } finally { sqlite.close(); }
});
