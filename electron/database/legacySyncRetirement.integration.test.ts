// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { ANDROID_COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionSchemaStatements.js';
import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import { encodeFramedSyncManifest } from '../../lib/core/database/framedSyncStagingSerialization.js';
import { retireCompanionLegacySyncState } from '../../lib/core/database/legacySyncRetirement.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { canonicalContentId, canonicalTransferIdSync, type CanonicalManifest } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { projectFramedSyncParentRelation, projectFramedSyncReview, restoreFramedSyncReview } from '../../lib/core/sync/framedSyncRelationReviewFact.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const hosts: ReturnType<typeof textDevice>[] = [];
afterEach(() => { hosts.splice(0).forEach(host => host.sqlite.close()); });
const retired = ['framed_sync_outbound_publications', 'framed_sync_inbound_transfers',
  'sync_identity_index_rows', 'sync_delivery_receipts', 'sync_peer_cursors',
  'node_version_device_bases', 'node_version_outbound_holds', 'node_version_pack_receipts',
  'node_version_inbound_receipts', 'node_version_confirmation_state'];
const names = (db: Database.Database) => db.prepare<[], { name: string }>(
  "SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name);

it('creates a desktop library without retired transmission tables', () => {
  const host = textDevice(); hosts.push(host);
  expect(names(host.sqlite).filter(name => retired.includes(name))).toEqual([]);
  for (const retained of ['node_version_local_source_revisions',
    'node_version_device_revisions', 'sync_group_restore_events', 'sync_change_log', 'framed_sync_inventory']) {
    expect(names(host.sqlite)).toContain(retained);
  }
});

it('creates a companion schema without retired transmission tables', () => {
  const db = new Database(':memory:');
  try {
    for (const sql of ANDROID_COMPANION_SCHEMA_STATEMENTS) db.exec(sql);
    expect(names(db).filter(name => retired.includes(name))).toEqual([]);
  } finally { db.close(); }
});

it.each(['android', 'ios'])('reads %s acceptance facts after transmission retirement', host => {
  const db = new Database(':memory:');
  try {
    for (const sql of ANDROID_COMPANION_SCHEMA_STATEMENTS) db.exec(sql);
    const source = readFileSync(host === 'android'
      ? 'android/app/src/androidTest/java/com/foliole/android/FolioleAcceptanceSyncEventProjection.java'
      : 'ios/App/AppAcceptanceProjectionTests/FolioleAcceptanceSyncEventProjectionTests.swift', 'utf8');
    const queries = host === 'ios'
      ? [...source.matchAll(/"""([\s\S]*?)"""/gu)].map(match => match[1]!)
      : [...source.split('private static JSONObject denseFacts')[0]!
        .matchAll(/"SELECT[^"\n]*"(?:\s*\+\s*"[^"\n]*")*/gu)]
        .map(match => [...match[0].matchAll(/"([^"\n]*)"/gu)].map(part => part[1]).join(''));
    expect(queries.length).toBeGreaterThan(0);
    for (const sql of queries) {
      // These empty-schema probes validate retained tables and columns, not selected values.
      const parameters = [...sql.matchAll(/\?/gu)].map(() => null);
      expect(() => db.prepare(sql).all(...parameters), sql).not.toThrow();
    }
  } finally { db.close(); }
});

it.each([147, 152])('upgrades schema %s preserving original identities, body hashes, edges and current text', async version => {
  const host = textDevice(); hosts.push(host);
  const base = textBranch('base', 'Original body');
  const next = textBranch('next', 'Current body', base);
  // Historical releases retained both bodies before freezing their publication.
  await applyConvergentSyncNodesWithDbPort(host.db, [base, next], { collectVersionPayloads: false });
  expect(host.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get('base'))
    .toBe('Original body');
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) host.sqlite.exec(sql);
  await publication(host, base);
  const before = businessRows(host.sqlite);
  before[1] = before[1]!.map(row => row.version_id === 'base' ? { ...row, body_text: null,
    snapshot_json: JSON.stringify({ ...JSON.parse(String(row.snapshot_json)), content: null,
      body_blob_hash: createHash('sha256').update('Original body').digest('hex'), body_deleted: true }) } : row);
  host.sqlite.exec('UPDATE framed_sync_outbound_publications SET protocol_version = 22');
  host.sqlite.pragma(`user_version = ${version}`);
  initializeDatabaseSchema(host.sqlite);
  expect(names(host.sqlite).filter(name => retired.includes(name))).toEqual([]);
  expect(businessRows(host.sqlite)).toEqual(before);
  expect((await host.current()).body_text).toBe('Current body');
  initializeDatabaseSchema(host.sqlite);
  expect(businessRows(host.sqlite)).toEqual(before);
});

it('discards obsolete companion transmission state without migrating temporary publication facts', async () => {
  const host = textDevice(); hosts.push(host);
  await host.receive([textBranch('current-mobile', 'Current request data')]);
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) host.sqlite.exec(sql);
  await publication(host, textBranch('obsolete-mobile', 'Temporary old publication'));
  const before = businessRows(host.sqlite);
  await retireCompanionLegacySyncState(createBetterSqliteDbPort(host.sqlite));
  expect(names(host.sqlite).filter(name => retired.includes(name))).toEqual([]);
  expect(businessRows(host.sqlite)).toEqual(before);
  await retireCompanionLegacySyncState(createBetterSqliteDbPort(host.sqlite));
  expect(businessRows(host.sqlite)).toEqual(before);
});

it.each([147, 152])('rolls back schema %s when an immutable publication has no matching business fact', async version => {
  const host = textDevice(); hosts.push(host);
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) host.sqlite.exec(sql);
  await publication(host, textBranch('unbacked-original', 'Irreplaceable body'));
  host.sqlite.exec('UPDATE framed_sync_outbound_publications SET protocol_version = 22');
  host.sqlite.pragma(`user_version = ${version}`);
  expect(() => initializeDatabaseSchema(host.sqlite)).toThrow('legacy_sync_original_fact_unbacked');
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(version);
  expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_publications').pluck().get()).toBe(1);
  expect(host.sqlite.prepare('SELECT data FROM framed_sync_available_blobs').pluck().get())
    .toEqual(Buffer.from('Irreplaceable body'));
});

it('keeps the old publication when its complete body is the only remaining copy', async () => {
  const host = textDevice(); hosts.push(host);
  const original = textBranch('unique-body', 'Only frozen copy');
  await host.receive([original]);
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) host.sqlite.exec(sql);
  await publication(host, original);
  host.sqlite.prepare("UPDATE node_sync_versions SET body_text = NULL, snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id = ?")
    .run(original.version_id);
  host.sqlite.pragma('user_version = 152');
  expect(() => initializeDatabaseSchema(host.sqlite)).toThrow('legacy_sync_original_body_unbacked');
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(152);
  expect(host.sqlite.prepare('SELECT data FROM framed_sync_available_blobs').pluck().get())
    .toEqual(Buffer.from('Only frozen copy'));
});

it.each(['missing', 'changed', 'matching'])('checks the %s business copy of a published original review', async (copy) => {
  const host = textDevice(); hosts.push(host);
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) host.sqlite.exec(sql);
  const fact = projectFramedSyncReview({ id: 'review', op_id: 'original-review', host_name: 'Mac',
    node_id: 'topic', grade: 3, kind: 'review', voids_op_id: null, scheduler_version: 'v1', reviewed_at: '2026-10-01',

       });
  if (copy !== 'missing') {
    await host.receive([textBranch('review-node', 'Review body')]);
    const original = restoreFramedSyncReview(fact);
    const columns = Object.keys(original);
    host.sqlite.prepare(`INSERT INTO review_log (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
      .run(...Object.values({ ...original, grade: copy === 'changed' ? 1 : original.grade }));
  }
  const manifest = { facts: [fact], blobs: [] };
  await publishManifest(host, manifest, 0);
  host.sqlite.pragma('user_version = 152');
  if (copy === 'matching') {
    initializeDatabaseSchema(host.sqlite);
    expect(names(host.sqlite)).not.toContain('framed_sync_outbound_publications');
    expect(host.sqlite.prepare('SELECT * FROM review_log').get()).toEqual(restoreFramedSyncReview(fact));
    return;
  }
  expect(() => initializeDatabaseSchema(host.sqlite)).toThrow('legacy_sync_original_review_unbacked');
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(152);
  expect(host.sqlite.prepare('SELECT manifest_json FROM framed_sync_outbound_publications').pluck().get())
    .toBe(encodeFramedSyncManifest(manifest));
});

it.each([false, true])('protects standalone original parent relations, backed=%s', async (backed) => {
  const host = textDevice(); hosts.push(host);
  const base = textBranch('parent', 'Original');
  const head = textBranch('child', 'Current', base);
  if (backed) await host.receive([base, head]);
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) host.sqlite.exec(sql);
  const fact = projectFramedSyncParentRelation({ object_id: 'topic', version_id: 'child',
    parent_version_id: 'parent', ordinal: 0 });
  await publishManifest(host, { facts: [fact], blobs: [] }, 0);
  host.sqlite.pragma('user_version = 152');
  if (backed) {
    const before = businessRows(host.sqlite);
    initializeDatabaseSchema(host.sqlite);
    expect(businessRows(host.sqlite)).toEqual(before);
    expect(names(host.sqlite)).not.toContain('framed_sync_outbound_publications');
  } else {
    expect(() => initializeDatabaseSchema(host.sqlite)).toThrow('legacy_sync_original_relation_unbacked');
    expect(host.sqlite.pragma('user_version', { simple: true })).toBe(152);
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_publications').pluck().get()).toBe(1);
  }
});

function businessRows(db: Database.Database) {
  return ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'sync_change_log', 'node_text_alternatives']
    .map(table => db.prepare<[], Record<string, unknown>>(`SELECT * FROM ${table} ORDER BY rowid`).all());
}

async function publication(host: ReturnType<typeof textDevice>, record: ReturnType<typeof textBranch>) {
  const projection = projectFramedSyncNodeRecord(record);
  const manifest = projection.manifest;
  const blob = manifest.blobs[0]!;
  host.sqlite.prepare('INSERT INTO framed_sync_available_blobs (sha256, byte_length, data) VALUES (?, ?, ?)')
    .run(blob.sha256, blob.byteLength, projection.bodyBlob);
  await publishManifest(host, manifest, projection.bodyBlob.length);
}

async function publishManifest(host: ReturnType<typeof textDevice>, manifest: CanonicalManifest, byteLength: number) {
  const contentId = await canonicalContentId(manifest);
  const context = { protocolVersion: 27, groupId: 'group', senderDeviceId: 'a', senderLibraryEpoch: 'a-epoch',
    receiverDeviceId: 'b', receiverLibraryEpoch: 'b-epoch' };
  const transferId = canonicalTransferIdSync(context, contentId);
  host.sqlite.prepare(`INSERT INTO framed_sync_outbound_publications
    (transfer_id, content_id, manifest_hash, canonical_manifest, manifest_json, protocol_version,
    group_id, sender_device_id, sender_library_epoch, receiver_device_id, receiver_library_epoch,
    fact_count, blob_count, total_blob_bytes, state)
    VALUES (?, ?, ?, ?, ?, 25, 'group', 'a', 'a-epoch', 'b', 'b-epoch', ?, ?, ?, 'published')`)
    .run(transferId, contentId, contentId, new Uint8Array(), encodeFramedSyncManifest(manifest), manifest.facts.length, manifest.blobs.length, byteLength);
}
