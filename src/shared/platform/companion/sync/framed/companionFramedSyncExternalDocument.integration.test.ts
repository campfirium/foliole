// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { closeLibraries, createPeer, root, startLibraries } from '../../../../../../electron/database/syncEmptyLibraryTestSupport.js';
import { bootstrapCompanionDatabase } from '../../../../../../lib/core/database/companionDatabaseLifecycle.js';
import { computeSyncContentHash } from '../../../../../../lib/core/database/syncState.js';
import { hashTextBody } from '../../../../../../lib/core/database/textBodyHash.js';
import type { CanonicalFact } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { readFramedSyncInventory } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { selectFramedSyncObjectStateFact } from '../../../../../../lib/core/sync/framedSyncObjectStateFact.js';
import { encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { factToWire } from '../../../../../../lib/core/sync/framedSyncWireProjection.js';
import { applySyncObjectInTransaction } from '../../../../../../lib/core/sync/syncObjectApplyExecutor.js';

import { applyCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';
import { installCompanionFramedSyncStaging } from './companionFramedSyncApply.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function stage(database: Database.Database, prefix: string, fact: CanonicalFact, body: string) {
  installCompanionFramedSyncStaging(database, prefix);
  const transferId = new Uint8Array(32).fill(1);
  const attemptId = new Uint8Array(16).fill(2);
  database.prepare(`INSERT INTO ${prefix}_transfers VALUES
    (?, ?, 'sender', 'sender-epoch', 'receiver', 'receiver-epoch', ?, 'ready_to_apply')`)
    .run(transferId, new Uint8Array(32).fill(3), attemptId);
  database.prepare(`INSERT INTO ${prefix}_frames VALUES (?, ?, '0', 3, ?)`)
    .run(transferId, attemptId, encodeValidatedProtocolMessage('fact', factToWire(fact)));
  const blob = fact.blobs[0]!;
  database.prepare(`INSERT INTO ${prefix}_blob_pins VALUES (?, ?, ?, ?, ?)`)
    .run(transferId, blob.sha256, Number(blob.byteLength), blob.role, Number(blob.required));
  database.prepare(`INSERT INTO ${prefix}_available_blobs VALUES (?, ?, ?)`)
    .run(blob.sha256, Number(blob.byteLength), Buffer.from(body));
  return transferId;
}

it.each(['android', 'ios'] as const)('persists original external document bytes through %s shared staging and reopen', async (kind) => {
  const source = createPeer('external-source');
  const body = 'Original external body with preserved bytes';
  const hash = hashTextBody(body);
  const payload = { body_blob_hash: hash, content_hash: hash, document_id: 'document', extension: 'md',
    file_name: 'original.md', folder_id: 'folder', reference_json: null,
    reference_kind: 'local_path', relative_path: 'original.md', title: 'Original' };
  const contentHash = computeSyncContentHash('external_document', payload);
  await applySyncObjectInTransaction(source.port, { object_type: 'external_document', object_id: 'document',
    content_hash: contentHash, deleted_at: null, payload_json: JSON.stringify({ ...payload, content: body }), updated_at: '2026-10-06' });
  const fact = await selectFramedSyncObjectStateFact(source.port,
    { globalId: 'document', objectType: 'external_document' }, `external_document:${contentHash}`);
  const file = path.join(root, 'companion-external.db');
  const stagingPath = path.join(root, 'external-staging.db');
  const sqlite = new Database(file);
  const staging = new Database(stagingPath);
  const receiver = createBetterSqliteDbPort(sqlite);
  try {
    await bootstrapCompanionDatabase(receiver, { allowCreate: true, expectedHostName: 'receiver', now: '2026-10-06' });
    const input = { receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
      senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch', stagingKind: kind, stagingPath,
      transferId: stage(staging, `framed_sync_${kind}`, fact, body) };
    await applyCompanionFramedSyncTransfer(receiver, input);
    await applyCompanionFramedSyncTransfer(receiver, input);
    const reopened = new Database(file, { readonly: true });
    try {
      expect(reopened.prepare('SELECT content FROM external_documents WHERE body_blob_hash = ?').pluck().get(hash)).toBe(body);
      expect(reopened.prepare('SELECT body_blob_hash FROM external_documents WHERE document_id = ?').pluck().get('document')).toBe(hash);
      expect(reopened.prepare('SELECT COUNT(*) FROM content_blob_data').pluck().get()).toBe(0);
      expect(reopened.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
      expect((await readFramedSyncInventory(createBetterSqliteDbPort(reopened)))
        .find((entry) => entry.objectType === 'external_document')).toEqual(
        (await readFramedSyncInventory(source.port)).find((entry) => entry.objectType === 'external_document'));
    } finally { reopened.close(); }
  } finally { staging.close(); sqlite.close(); fs.rmSync(stagingPath); }
});
