// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../../../../../lib/core/database/companionSchemaStatements.js';
import { projectFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeProjection.js';
import { encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { factToWire } from '../../../../../../lib/core/sync/framedSyncWireProjection.js';
import type { NativeSyncNodeRecord } from '../../../../../../lib/platform/nativeSyncContract.js';

import { applyCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';
import { installCompanionFramedSyncStaging } from './companionFramedSyncApply.testSupport.js';

const roots: string[] = [];
const databases: Database.Database[] = [];

afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
  roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true }));
});

it.each(['android', 'ios'] as const)(
  'applies and receipts a %s Node only with its natively published resource key', async (kind) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-framed-resource-apply-'));
  roots.push(root);
  const stagingPath = path.join(root, 'staging.db');
  const main = tracked(new Database(':memory:'));
  const staging = tracked(new Database(stagingPath));
  main.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  const prefix = `framed_sync_${kind}`;
  installCompanionFramedSyncStaging(staging, prefix);
  const record = nodeRecord();
  const resourceBytes = new TextEncoder().encode('%PDF-1.7\nresource');
  const resourceHash = sha256(resourceBytes);
  const storageKey = `${bytesToHex(resourceHash)}.pdf`;
  record.snapshot.resource_references = JSON.stringify([
    { original_name: 'Paper.pdf', role: 'reference', storage_key: storageKey }
  ]);
  const projection = projectFramedSyncNodeRecord(record, [{
    byteLength: BigInt(resourceBytes.byteLength), required: true, role: 3, sha256: resourceHash
  }]);
  const transferId = new Uint8Array(32).fill(8);
  const attemptId = new Uint8Array(16).fill(8);
  stage(staging, prefix, transferId, attemptId, projection, storageKey, resourceBytes.byteLength);

  const receipt = await applyCompanionFramedSyncTransfer(createBetterSqliteDbPort(main, {
    name: 'framed-resource-apply-test'
  }), {
    receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
    resourceStorageKeys: [storageKey], senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch',
    stagingKind: kind, stagingPath, transferId
  });

  const applied = main.prepare('SELECT resource_references FROM nodes WHERE id = ?')
    .get('node-1') as { resource_references: string };
  expect(JSON.parse(applied.resource_references)).toEqual(
    JSON.parse(record.snapshot.resource_references));
  expect(main.prepare('SELECT COUNT(*) AS count FROM framed_sync_receipts').get()).toEqual({ count: 1 });
  expect(bytesToHex(receipt.appliedStateHash)).toBe('4'.repeat(64));
  }
);

function stage(
  database: Database.Database,
  prefix: string,
  transferId: Uint8Array,
  attemptId: Uint8Array,
  projection: ReturnType<typeof projectFramedSyncNodeRecord>,
  storageKey: string,
  resourceLength: number
) {
  database.prepare(`INSERT INTO ${prefix}_transfers VALUES
    (?, ?, ?, ?, ?, ?, ?, 'ready_to_apply')`).run(transferId, new Uint8Array(32).fill(8),
    'sender', 'sender-epoch', 'receiver', 'receiver-epoch', attemptId);
  database.prepare(`INSERT INTO ${prefix}_frames VALUES (?, ?, ?, 3, ?)`).run(
    transferId, attemptId, '0', encodeValidatedProtocolMessage(
      'fact', factToWire(projection.manifest.facts[0]!)));
  const body = projection.manifest.blobs[0]!;
  database.prepare(`INSERT INTO ${prefix}_available_blobs VALUES (?, ?, ?)`)
    .run(body.sha256, Number(body.byteLength), projection.bodyBlob);
  database.prepare(`INSERT INTO ${prefix}_blob_pins VALUES (?, ?, ?, 1, 1)`)
    .run(transferId, body.sha256, Number(body.byteLength));
  const resource = projection.manifest.blobs[1]!;
  database.prepare(`INSERT INTO ${prefix}_available_resources VALUES (?, ?, ?)`)
    .run(resource.sha256, resourceLength, storageKey);
  database.prepare(`INSERT INTO ${prefix}_resource_pins VALUES (?, ?, ?, 3, 1, ?)`)
    .run(transferId, resource.sha256, resourceLength, storageKey);
}

function tracked(database: Database.Database) {
  databases.push(database);
  return database;
}

function nodeRecord(): NativeSyncNodeRecord {
  const time = '2026-10-05T01:00:00.000Z';
  return {
    ancestor_version_ids: [], body_text: 'Transferred body', content_hash: '4'.repeat(64),
    host_name: 'sender', is_tombstone: false, object_id: 'node-1', object_type: 'node',
    parent_version_id: null, parent_version_ids: [], updated_at: time,
    version_created_at: time, version_id: 'version-1', snapshot: {
      anchor_link: null, anchor_resolution_status: null, anchor_source_version_id: null,
      attachments: [], body_blob_hash: null, created_at: time, deleted_at: null,
      desired_retention: null, enable_short_term: false, hide_title_heading: false,
      id: 'node-1', image_regions: null, image_sources: null,
      import_content_fingerprint: null, import_source_fingerprint: null, is_title_manual: true,
      kind: 'topic', manual_child_order: null, opening_text: null, parent_id: null,
      position: 0, priority: 0, resource_references: null, reveal: null,
      sequential_reading_enabled: false, shelved_at: null, title: 'Node', updated_at: time,
      virtual_filter: null
    }
  };
}
