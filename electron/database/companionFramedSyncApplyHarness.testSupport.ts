import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { migrateCompanionFramedSyncInventory } from '../../lib/core/database/framedSyncInventoryMigration.js';
import type { CanonicalBlob, CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { projectFramedSyncReview } from '../../lib/core/sync/framedSyncRelationReviewFact.js';
import { factToWire } from '../../lib/core/sync/framedSyncWireProjection.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { installCompanionFramedSyncStaging } from '../../src/shared/platform/companion/sync/framed/companionFramedSyncApply.testSupport.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const roots: string[] = [];
const databases: Database.Database[] = [];

export function closeApplyHarnesses() {
  databases.splice(0).forEach((database) => database.close());
  roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true }));
}

export async function harness(kind: 'android' | 'ios') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-framed-apply-'));
  roots.push(root);
  const stagingPath = path.join(root, 'staging.db');
  const main = tracked(new Database(':memory:'));
  const staging = tracked(new Database(stagingPath));
  main.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  await migrateCompanionFramedSyncInventory(createBetterSqliteDbPort(main));
  const prefix = `framed_sync_${kind}`;
  installCompanionFramedSyncStaging(staging, prefix);
  return { main, port: createBetterSqliteDbPort(main, { name: 'framed-apply-test' }),
    prefix, staging, stagingPath };
}

export function input(kind: 'android' | 'ios', stagingPath: string, transferId: Uint8Array) {
  return { receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
    senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch',
    stagingKind: kind, stagingPath, transferId };
}

export function reviewFact(opId: string, nodeId = 'node-1') {
  const time = '2026-10-05T02:00:00.000Z';
  return projectFramedSyncReview({
    difficulty_after: 3.75, difficulty_before: 2.25, due_after: time, due_before: time,
    grade: 3, host_name: 'sender', id: `row-${opId}`, node_id: nodeId, op_id: opId,
    reviewed_at: time, scheduler_version: 'fsrs-6', stability_after: 4.5, stability_before: 2.5
  });
}

export function stage(database: Database.Database, prefix: string, value: {
  blob?: { data: Uint8Array; descriptor: CanonicalBlob };
  blobs?: readonly { data: Uint8Array; descriptor: CanonicalBlob }[];
  facts: readonly CanonicalFact[];
  transferId: Uint8Array;
}) {
  const discriminator = value.transferId.at(0);
  if (discriminator === undefined) throw new Error('transfer_id_empty');
  const attemptId = new Uint8Array(16).fill(discriminator);
  database.prepare(`INSERT INTO ${prefix}_transfers VALUES
    (?, ?, ?, ?, ?, ?, ?, 'ready_to_apply')`).run(
    value.transferId, new Uint8Array(32).fill(discriminator),
    'sender', 'sender-epoch', 'receiver', 'receiver-epoch', attemptId
  );
  const insertFrame = database.prepare(`INSERT INTO ${prefix}_frames VALUES (?, ?, ?, ?, ?)`);
  value.facts.forEach((fact, index) => insertFrame.run(
    value.transferId, attemptId, String(index), 3,
    encodeValidatedProtocolMessage('fact', factToWire(fact))
  ));
  for (const { data, descriptor } of value.blobs ?? (value.blob ? [value.blob] : [])) {
    database.prepare(`INSERT OR IGNORE INTO ${prefix}_available_blobs VALUES (?, ?, ?)`)
      .run(descriptor.sha256, Number(descriptor.byteLength), data);
    database.prepare(`INSERT INTO ${prefix}_blob_pins VALUES (?, ?, ?, ?, ?)`)
      .run(value.transferId, descriptor.sha256, Number(descriptor.byteLength), descriptor.role,
        descriptor.required ? 1 : 0);
  }
}

function tracked(database: Database.Database) {
  databases.push(database);
  return database;
}

export function nodeRecord(): NativeSyncNodeRecord {
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
      parent_id: null, position: 0, priority: 0, resource_references: '[]', reveal: null,
      sequential_reading_enabled: false, shelved_at: null, title: 'Node', updated_at: time,
      virtual_filter: null
    }
  };
}
