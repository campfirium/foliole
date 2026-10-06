// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { closeLibraries, createPeer, root, startLibraries } from '../../../../../../electron/database/syncEmptyLibraryTestSupport.js';
import { bootstrapCompanionDatabase } from '../../../../../../lib/core/database/companionDatabaseLifecycle.js';
import { computeSyncContentHash } from '../../../../../../lib/core/database/syncState.js';
import { buildCanonicalSettingSyncPayload } from '../../../../../../lib/core/sync/canonicalPrivateStatePayload.js';
import { buildCanonicalSyncTombstone } from '../../../../../../lib/core/sync/canonicalSyncTombstone.js';
import type { CanonicalFact } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { selectFramedSyncObjectStateFact } from '../../../../../../lib/core/sync/framedSyncObjectStateFact.js';
import { encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { factToWire } from '../../../../../../lib/core/sync/framedSyncWireProjection.js';
import { applySyncObjectInTransaction } from '../../../../../../lib/core/sync/syncObjectApplyExecutor.js';

import { applyCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';
import { installCompanionFramedSyncStaging } from './companionFramedSyncApply.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function stage(database: Database.Database, prefix: string, fact: CanonicalFact, sequence: number) {
  const transferId = new Uint8Array(32).fill(sequence);
  const attemptId = new Uint8Array(16).fill(sequence);
  database.prepare(`INSERT INTO ${prefix}_transfers VALUES
    (?, ?, 'sender', 'sender-epoch', 'receiver', 'receiver-epoch', ?, 'ready_to_apply')`)
    .run(transferId, new Uint8Array(32).fill(sequence), attemptId);
  database.prepare(`INSERT INTO ${prefix}_frames VALUES (?, ?, '0', 3, ?)`)
    .run(transferId, attemptId, encodeValidatedProtocolMessage('fact', factToWire(fact)));
  return transferId;
}

it.each(['android', 'ios'] as const)('applies shared settings and tombstones while preserving private settings through %s restart', async (kind) => {
  const source = createPeer('setting-source');
  const file = path.join(root, 'companion-setting.db');
  const stagingPath = path.join(root, 'setting-staging.db');
  const sqlite = new Database(file);
  const staging = new Database(stagingPath);
  const receiver = createBetterSqliteDbPort(sqlite);
  const prefix = `framed_sync_${kind}`;
  let sequence = 0;
  try {
    await bootstrapCompanionDatabase(receiver, { allowCreate: true, expectedHostName: 'receiver', now: '2026-10-06' });
    installCompanionFramedSyncStaging(staging, prefix);
    const privatePayload = buildCanonicalSettingSyncPayload({ form_factor: 'phone', host_name: 'receiver',
      key: 'app_settings', platform: kind, scope: 'user_space', value_json: '{"local":true}' });
    const privateId = `host:${kind}:phone:receiver:discourse_publish_settings`;
    await applySyncObjectInTransaction(receiver, { object_type: 'setting', object_id: privateId,
      content_hash: computeSyncContentHash('setting', privatePayload), deleted_at: null,
      payload_json: JSON.stringify(privatePayload), updated_at: '2026-10-06' }, { hostName: 'receiver' });
    for (const host of ['*']) {
      const id = `user_space:${kind}:phone:${host}:app_settings`;
      const payload = buildCanonicalSettingSyncPayload({ form_factor: 'phone', host_name: host,
        key: 'app_settings', platform: kind, scope: 'user_space', value_json: '{"server":"original.example"}' });
      const hash = computeSyncContentHash('setting', payload);
      const record = { object_type: 'setting' as const, object_id: id, content_hash: hash,
        deleted_at: null, payload_json: JSON.stringify(payload), updated_at: '2026-10-06' };
      await applySyncObjectInTransaction(source.port, record, { hostName: host });
      const apply = async (contentHash: string) => {
        const fact = await selectFramedSyncObjectStateFact(source.port,
          { globalId: id, objectType: 'setting' }, `setting:${contentHash}`);
        const input = { receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
          senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch', stagingKind: kind, stagingPath,
          transferId: stage(staging, prefix, fact, ++sequence) };
        await applyCompanionFramedSyncTransfer(receiver, input);
        await applyCompanionFramedSyncTransfer(receiver, input);
        expect(await selectFramedSyncObjectStateFact(receiver,
          { globalId: id, objectType: 'setting' }, `setting:${contentHash}`)).toEqual(fact);
      };
      await apply(hash);
      expect(sqlite.prepare('SELECT value_json FROM setting_records WHERE host_name = ? AND key = ?')
        .pluck().get(host, payload.key)).toBe(payload.value_json);
      const deletedHash = computeSyncContentHash('setting', buildCanonicalSyncTombstone(id));
      await applySyncObjectInTransaction(source.port, { ...record, content_hash: deletedHash,
        deleted_at: '2026-10-07', payload_json: null, updated_at: '2026-10-07' }, { hostName: host });
      await apply(deletedHash);
      expect(sqlite.prepare('SELECT value_json FROM setting_records WHERE host_name = ? AND key = ?').get(host, payload.key)).toBeUndefined();
    }
    await bootstrapCompanionDatabase(receiver, { allowCreate: false, expectedHostName: 'receiver', now: '2026-10-08' });
    const reopened = new Database(file, { readonly: true });
    try {
      expect(reopened.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(2);
      expect(reopened.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_type = 'setting' AND deleted_at IS NOT NULL").pluck().get()).toBe(1);
      expect(reopened.prepare('SELECT value_json FROM setting_records WHERE key = ? AND host_name = ?').pluck().get(privatePayload.key, 'receiver')).toBe(privatePayload.value_json);
      expect(reopened.prepare("SELECT value FROM companion_meta WHERE key = 'host_name'").pluck().get()).toBe('receiver');
    } finally { reopened.close(); }
  } finally { staging.close(); sqlite.close(); fs.rmSync(stagingPath); }
});
