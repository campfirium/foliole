// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { observeReads } from '../../../electron/database/syncNodeVerifiedTopicConflict.testSupport.js';
import type { NativeSyncObjectRecord } from '../../platform/nativeSyncContract.js';
import { BODY_CONTENT_SCHEMA } from '../database/bodyContentSchema.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../database/companionSchemaStatements.js';
import { initializeDatabaseSchema } from '../database/migrations.js';
import { computeSyncContentHash } from '../database/syncState.js';
import { hashTextBody } from '../database/textBodyHash.js';

import { stageTextBodyContent } from './bodyContentWrite.js';
import { buildCanonicalExternalDocumentPayload } from './canonicalExternalResourcePayload.js';
import { buildCanonicalSyncTombstone } from './canonicalSyncTombstone.js';
import { upsertTextBodyBlob } from './syncNodeTextBodyBlobs.js';
import { applySyncObjectInTransaction } from './syncObjectApplyExecutor.js';
import { applyVerifiedExternalDocumentInTransaction } from './syncVerifiedExternalDocumentApply.js';
import { readBodyText } from './verifiedBody.js';

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));

function host(kind: 'desktop' | 'companion') {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  if (kind === 'desktop') initializeDatabaseSchema(sqlite);
  else sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  sqlite.exec(BODY_CONTENT_SCHEMA.join(';\n'));
  return { sqlite, db: createBetterSqliteDbPort(sqlite) };
}

function record(body: string, title = 'Document', updatedAt = '2026-10-07T00:00:00Z') {
  const payload = buildCanonicalExternalDocumentPayload({ body_blob_hash: hashTextBody(body),
    content_hash: 'original-source-content-hash', document_id: 'document', extension: 'md',
    file_name: 'original.md', folder_id: 'folder', reference_json: null, reference_kind: 'local_path',
    relative_path: 'original.md', title });
  return { object_type: 'external_document', object_id: 'document', deleted_at: null,
    content_hash: computeSyncContentHash('external_document', payload), payload_json: JSON.stringify(payload),
    updated_at: updatedAt } satisfies NativeSyncObjectRecord & { object_type: 'external_document' };
}

it.each(['desktop', 'companion'] as const)('preserves %s external metadata, original identities and LWW selection with stable Unicode bodies', async (kind) => {
  const old = host(kind);
  const stable = host(kind);
  const body = '中😀'.repeat(500_000);
  const incoming = record(body);
  await upsertTextBodyBlob(old.db, body, incoming.updated_at, hashTextBody(body));
  const ref = await stageTextBodyContent(stable.db, body);
  const reads = observeReads(stable.db);
  let hooks = 0;
  const options = { onPayloadAppliedInTransaction: async () => { hooks++; } };
  expect(await old.db.transaction((tx) => applySyncObjectInTransaction(tx, incoming))).toBe('external_document:document');
  expect(await reads.port.transaction((tx) => applyVerifiedExternalDocumentInTransaction(tx, incoming, { kind: 'readable', ref }, options)))
    .toBe('external_document:document');
  expect(reads.sizes).toEqual([]);
  const read = (value: typeof old) => value.sqlite.prepare('SELECT * FROM external_documents').get();
  expect(read(stable)).toEqual(read(old));
  expect(stable.sqlite.prepare('SELECT content_hash FROM external_documents').pluck().get()).toBe('original-source-content-hash');
  expect(stable.sqlite.prepare('SELECT * FROM sync_object_state').all()).toEqual(old.sqlite.prepare('SELECT * FROM sync_object_state').all());
  expect(await readBodyText(stable.db, ref)).toBe(body);
  expect(old.sqlite.prepare('SELECT CAST(data AS TEXT) FROM content_blob_data WHERE hash = ?').pluck().get(ref.hash)).toBe(body);
  expect(ref.byteLength).toBeGreaterThan(3 * 1024 * 1024);
  expect(await stable.db.transaction((tx) => applyVerifiedExternalDocumentInTransaction(tx, incoming, { kind: 'readable', ref }, options))).toBeNull();
  expect(await old.db.transaction((tx) => applySyncObjectInTransaction(tx, incoming))).toBeNull();
  expect(hooks).toBe(1);
  const conflict = record(body, 'Concurrent title', '2026-10-07T00:00:00Z');
  const oldResult = await old.db.transaction((tx) => applySyncObjectInTransaction(tx, conflict));
  expect(await stable.db.transaction((tx) => applyVerifiedExternalDocumentInTransaction(tx, conflict, { kind: 'readable', ref }, options))).toBe(oldResult);
  const stale = record(body, 'Stale title', '2026-10-06T00:00:00Z');
  expect(await stable.db.transaction((tx) => applyVerifiedExternalDocumentInTransaction(tx, stale, { kind: 'readable', ref }, options))).toBeNull();
  expect(await old.db.transaction((tx) => applySyncObjectInTransaction(tx, stale))).toBeNull();
  const replacement = record('New selected body', 'New title', '2026-10-08T00:00:00Z');
  const replacementRef = await stageTextBodyContent(stable.db, 'New selected body');
  await upsertTextBodyBlob(old.db, 'New selected body', replacement.updated_at, replacementRef.hash);
  await old.db.transaction((tx) => applySyncObjectInTransaction(tx, replacement));
  await stable.db.transaction((tx) => applyVerifiedExternalDocumentInTransaction(tx, replacement, { kind: 'readable', ref: replacementRef }, options));
  expect(await readBodyText(stable.db, replacementRef)).toBe('New selected body');
  expect(read(stable)).toEqual(read(old));
  expect(stable.sqlite.prepare('SELECT * FROM sync_object_state').all()).toEqual(old.sqlite.prepare('SELECT * FROM sync_object_state').all());
});

it.each(['desktop', 'companion'] as const)('adopts %s empty bodies and preserves the original tombstone contract', async (kind) => {
  const old = host(kind);
  const stable = host(kind);
  const incoming = record('');
  const ref = await stageTextBodyContent(stable.db, '');
  await old.db.transaction((tx) => applySyncObjectInTransaction(tx, incoming));
  await stable.db.transaction((tx) => applyVerifiedExternalDocumentInTransaction(tx, incoming, { kind: 'readable', ref }));
  expect(await readBodyText(stable.db, ref)).toBe('');
  const deleted = { ...incoming, deleted_at: '2026-10-08T00:00:00Z', updated_at: '2026-10-08T00:00:00Z',
    payload_json: null, content_hash: computeSyncContentHash('external_document', buildCanonicalSyncTombstone('document')) };
  await old.db.transaction((tx) => applySyncObjectInTransaction(tx, deleted));
  await stable.db.transaction((tx) => applyVerifiedExternalDocumentInTransaction(tx, deleted, { kind: 'absent' }));
  expect(stable.sqlite.prepare('SELECT * FROM external_documents').all()).toEqual(old.sqlite.prepare('SELECT * FROM external_documents').all());
  expect(stable.sqlite.prepare('SELECT * FROM sync_object_state').all()).toEqual(old.sqlite.prepare('SELECT * FROM sync_object_state').all());
});

it('rolls back body adoption, document fields and original state when the existing payload hook fails', async () => {
  const stable = host('desktop');
  const incoming = record('Original');
  const ref = await stageTextBodyContent(stable.db, 'Original');
  await expect(stable.db.transaction((tx) => applyVerifiedExternalDocumentInTransaction(tx, incoming, { kind: 'readable', ref }, {
    onPayloadAppliedInTransaction: async () => { throw new Error('enqueue_failure'); }
  }))).rejects.toThrow('enqueue_failure');
  expect(stable.sqlite.prepare('SELECT COUNT(*) FROM external_documents').pluck().get()).toBe(0);
  expect(stable.sqlite.prepare('SELECT COUNT(*) FROM sync_object_state').pluck().get()).toBe(0);
  expect(stable.sqlite.prepare('SELECT COUNT(*) FROM content_blobs').pluck().get()).toBe(0);
  expect(await readBodyText(stable.db, ref)).toBe('Original');
  await stable.db.transaction((tx) => applyVerifiedExternalDocumentInTransaction(tx, incoming, { kind: 'readable', ref }));
  expect(stable.sqlite.prepare('SELECT COUNT(*) FROM content_blobs').pluck().get()).toBe(1);
});

it('rejects mismatched stable body references and full-text payloads without changing metadata', async () => {
  const stable = host('companion');
  const ref = await stageTextBodyContent(stable.db, 'Other');
  const incoming = record('Original');
  expect(() => applyVerifiedExternalDocumentInTransaction(stable.db, incoming, { kind: 'readable', ref }))
    .toThrow('framed_sync_external_document_body_invalid');
  expect(() => applyVerifiedExternalDocumentInTransaction(stable.db, incoming, { kind: 'unavailable', hash: ref.hash }))
    .toThrow('framed_sync_external_document_body_invalid');
  expect(() => applyVerifiedExternalDocumentInTransaction(stable.db, incoming, { kind: 'absent' }))
    .toThrow('framed_sync_external_document_body_invalid');
  expect(() => applyVerifiedExternalDocumentInTransaction(stable.db, { ...incoming,
    payload_json: JSON.stringify({ ...JSON.parse(incoming.payload_json), content: 'Original' }) }, { kind: 'readable', ref }))
    .toThrow('external_document_metadata_contains_body');
});

it.each(['desktop', 'companion'] as const)('preserves %s unavailable body identity and later arrival LWW decisions', async (kind) => {
  const old = host(kind);
  const stable = host(kind);
  const body = 'Missing 中文😀';
  const incoming = record(body);
  const hash = hashTextBody(body);
  await old.db.transaction((tx) => applySyncObjectInTransaction(tx, incoming));
  await stable.db.transaction((tx) => applyVerifiedExternalDocumentInTransaction(tx, incoming, { kind: 'unavailable', hash }));
  const rows = (value: typeof old) => value.sqlite.prepare('SELECT * FROM external_documents').all();
  const states = (value: typeof old) => value.sqlite.prepare('SELECT * FROM sync_object_state').all();
  expect(rows(stable)).toEqual(rows(old));
  expect(states(stable)).toEqual(states(old));
  expect(stable.sqlite.prepare('SELECT body_blob_hash FROM external_documents').pluck().get()).toBe(hash);
  expect(stable.sqlite.prepare('SELECT COUNT(*) FROM content_bodies').pluck().get()).toBe(0);
  expect(stable.sqlite.prepare('SELECT COUNT(*) FROM content_blobs').pluck().get()).toBe(0);
  const ref = await stageTextBodyContent(stable.db, body);
  await upsertTextBodyBlob(old.db, body, incoming.updated_at, hash);
  expect(await old.db.transaction((tx) => applySyncObjectInTransaction(tx, incoming))).toBeNull();
  expect(await stable.db.transaction((tx) => applyVerifiedExternalDocumentInTransaction(tx, incoming, { kind: 'readable', ref }))).toBeNull();
  expect(stable.sqlite.prepare('SELECT COUNT(*) FROM content_blobs').pluck().get()).toBe(0);
  const later = record(body, 'Later title', '2026-10-08T00:00:00Z');
  const result = await old.db.transaction((tx) => applySyncObjectInTransaction(tx, later));
  expect(await stable.db.transaction((tx) => applyVerifiedExternalDocumentInTransaction(tx, later, { kind: 'readable', ref }))).toBe(result);
  expect(rows(stable)).toEqual(rows(old));
  expect(states(stable)).toEqual(states(old));
  expect(await readBodyText(stable.db, ref)).toBe(body);
  expect(stable.sqlite.prepare('SELECT COUNT(*) FROM content_blobs').pluck().get()).toBe(1);
});

it('accepts absent metadata without a body hash and rejects body states on tombstones', async () => {
  const stable = host('companion');
  const incoming = record('Original');
  const payload = { ...JSON.parse(incoming.payload_json), body_blob_hash: null };
  const absent = { ...incoming, payload_json: JSON.stringify(payload), content_hash: computeSyncContentHash('external_document', payload) };
  expect(await stable.db.transaction((tx) => applyVerifiedExternalDocumentInTransaction(tx, absent, { kind: 'absent' })))
    .toBe('external_document:document');
  const deleted = { ...incoming, deleted_at: '2026-10-08T00:00:00Z', updated_at: '2026-10-08T00:00:00Z',
    payload_json: null, content_hash: computeSyncContentHash('external_document', buildCanonicalSyncTombstone('document')) };
  const ref = await stageTextBodyContent(stable.db, 'Original');
  expect(() => applyVerifiedExternalDocumentInTransaction(stable.db, deleted, { kind: 'readable', ref }))
    .toThrow('framed_sync_external_document_body_invalid');
  expect(() => applyVerifiedExternalDocumentInTransaction(stable.db, deleted, { kind: 'unavailable', hash: ref.hash }))
    .toThrow('framed_sync_external_document_body_invalid');
});
