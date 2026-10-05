// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { projectDesktopFramedSyncNodeRecord } from '../../../../../../electron/sync/desktopFramedSyncNodeProjection.js';
import { factToWire } from '../../../../../../electron/sync/desktopFramedSyncProcessWire.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../../../../../lib/core/database/companionSchemaStatements.js';
import { encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import type { NativeSyncNodeRecord } from '../../../../../../lib/platform/nativeSyncContract.js';

import { applyCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';

const roots: string[] = [];
const databases: Database.Database[] = [];

afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
  roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true }));
});

it.each(['android', 'ios'] as const)(
  'applies an authenticated %s fact and persists its receipt in the business database', async (kind) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-framed-apply-'));
  roots.push(root);
  const stagingPath = path.join(root, 'staging.db');
  const main = tracked(new Database(':memory:'));
  const staging = tracked(new Database(stagingPath));
  main.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  const prefix = `framed_sync_${kind}`;
  installStaging(staging, prefix);

  const projection = projectDesktopFramedSyncNodeRecord(nodeRecord());
  const transferId = new Uint8Array(32).fill(1);
  const contentId = new Uint8Array(32).fill(2);
  const attemptId = new Uint8Array(16).fill(3);
  const blob = projection.manifest.blobs[0]!;
  staging.prepare(`INSERT INTO ${prefix}_transfers VALUES
    (?, ?, ?, ?, ?, ?, ?, 'ready_to_apply')`)
    .run(transferId, contentId, 'sender', 'sender-epoch', 'receiver', 'receiver-epoch', attemptId);
  staging.prepare(`INSERT INTO ${prefix}_frames VALUES (?, ?, ?, ?, ?)`).run(
    transferId, attemptId, '0', 3,
    encodeValidatedProtocolMessage('fact', factToWire(projection.manifest.facts[0]!))
  );
  staging.prepare(`INSERT INTO ${prefix}_available_blobs VALUES (?, ?, ?)`)
    .run(blob.sha256, Number(blob.byteLength), projection.bodyBlob);
  staging.prepare(`INSERT INTO ${prefix}_blob_pins VALUES (?, ?, ?, ?, ?)`)
    .run(transferId, blob.sha256, Number(blob.byteLength), blob.role, 1);

  const input = {
    receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
    senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch',
    stagingKind: kind, stagingPath, transferId
  };
  const port = createBetterSqliteDbPort(main, { name: 'framed-apply-test' });
  const receipt = await applyCompanionFramedSyncTransfer(port, input);
  await applyCompanionFramedSyncTransfer(port, input);

  expect(receipt).toMatchObject({ receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch' });
  expect(main.prepare(`SELECT n.title, CAST(cbd.data AS TEXT) AS content, n.current_version_id
      FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.id = ?`)
    .get('node-1')).toEqual({ content: 'Transferred body', current_version_id: 'version-1', title: 'Node' });
  expect(main.prepare('SELECT COUNT(*) AS count FROM framed_sync_receipts').get()).toEqual({ count: 1 });
});

function tracked(database: Database.Database) {
  databases.push(database);
  return database;
}

function installStaging(database: Database.Database, prefix: string) {
  database.exec(`CREATE TABLE ${prefix}_transfers (
      transfer_id BLOB PRIMARY KEY, content_id BLOB NOT NULL,
      sender_device_id TEXT NOT NULL, sender_library_epoch TEXT NOT NULL,
      receiver_device_id TEXT NOT NULL, receiver_library_epoch TEXT NOT NULL,
      active_attempt_id BLOB NOT NULL, state TEXT NOT NULL);
    CREATE TABLE ${prefix}_frames (
      transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sequence TEXT NOT NULL,
      frame_type INTEGER NOT NULL, authenticated_plaintext BLOB NOT NULL);
    CREATE TABLE ${prefix}_available_blobs (
      sha256 BLOB PRIMARY KEY, byte_length INTEGER NOT NULL, data BLOB NOT NULL);
    CREATE TABLE ${prefix}_blob_pins (
      transfer_id BLOB NOT NULL, sha256 BLOB NOT NULL, byte_length INTEGER NOT NULL,
      role INTEGER NOT NULL, required INTEGER NOT NULL);`);
}

function nodeRecord(): NativeSyncNodeRecord {
  const time = '2026-10-05T01:00:00.000Z';
  return {
    ancestor_version_ids: [], body_text: 'Transferred body', content_hash: '4'.repeat(64),
    host_name: 'sender', is_tombstone: false, object_id: 'node-1', object_type: 'node',
    parent_version_id: null, parent_version_ids: [], updated_at: time,
    version_created_at: time, version_id: 'version-1',
    snapshot: {
      anchor_link: null, anchor_resolution_status: null, anchor_source_version_id: null,
      attachments: [], body_blob_hash: null, created_at: time, deleted_at: null,
      desired_retention: null, enable_short_term: false, hide_title_heading: false,
      id: 'node-1', image_regions: null, image_sources: null,
      import_content_fingerprint: null, import_source_fingerprint: null,
      is_title_manual: true, kind: 'topic', manual_child_order: null, opening_text: null,
      parent_id: null, position: 0, priority: 0, resource_references: null, reveal: null,
      sequential_reading_enabled: false, shelved_at: null, title: 'Node', updated_at: time,
      virtual_filter: null
    }
  };
}
