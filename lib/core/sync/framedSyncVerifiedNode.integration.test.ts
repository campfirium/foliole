// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bytesToHex } from '@noble/hashes/utils.js';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { BODY_CONTENT_CHUNK_BYTES, BODY_CONTENT_SCHEMA } from '../database/bodyContentSchema.js';

import { stageBodyContent } from './bodyContentWrite.js';
import { canonicalManifestBytes } from './framedSyncCanonicalManifest.js';
import { projectFramedSyncNodeIdentityFact, projectFramedSyncNodeRecord, projectVerifiedFramedSyncNode } from './framedSyncNodeProjection.js';
import { restoreFramedSyncNodeIdentityFact, restoreFramedSyncNodeMetadata } from './framedSyncNodeRestore.js';
import { restoreVerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';

function record(body: string): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: ['root'], body_text: body, content_hash: '1'.repeat(64),
    host_name: 'desktop', object_id: 'node', object_type: 'node', parent_version_id: 'root',
    parent_version_ids: ['root'], updated_at: '2026-10-07T00:00:00.000Z',
    version_created_at: '2026-10-07T00:00:00.000Z', version_id: 'version',
    snapshot: { id: 'node', title: 'Title', kind: 'topic', content: body,
      attachments: [], anchor_link: null, body_blob_hash: null, created_at: '2026-10-07T00:00:00.000Z',
      updated_at: '2026-10-07T00:00:00.000Z', deleted_at: null, desired_retention: null,
      hide_title_heading: false, image_regions: null, is_title_manual: true, opening_text: null,
      parent_id: null, position: 0, priority: null, reveal: null, virtual_filter: null }
  };
}

async function* chunks(data: Uint8Array) {
  for (let offset = 0; offset < data.byteLength; offset += BODY_CONTENT_CHUNK_BYTES) {
    yield data.subarray(offset, offset + BODY_CONTENT_CHUNK_BYTES);
  }
}

it('recovers verified identities after closing the database without loading body bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'foliole-verified-body-'));
  const file = join(root, 'body.sqlite');
  let sqlite: Database.Database | undefined;
  try {
    const source = record('中😀'.repeat(Math.floor(3 * 1024 * 1024 / 7)) + 'abcde');
    const alternative = projectFramedSyncNodeRecord(record('alternative'));
    const alternativeHash = bytesToHex(alternative.manifest.blobs[0]!.sha256);
    source.snapshot.text_alternatives = [{ id: 'alternative', body_blob_hash: alternativeHash,
      source_host_name: 'other', created_at: '2026-10-06T00:00:00.000Z', expires_at: '2026-11-05T00:00:00.000Z' }];
    source.alternative_bodies = [{ hash: alternativeHash, text: 'alternative' }];
    const projection = projectFramedSyncNodeRecord(source);
    const fact = projection.manifest.facts[0]!;
    sqlite = new Database(file);
    for (const sql of BODY_CONTENT_SCHEMA) sqlite.exec(sql);
    let db = createBetterSqliteDbPort(sqlite);
    for (const body of [{ blob: projection.manifest.blobs[0]!, data: projection.bodyBlob },
      ...projection.alternativeBodyBlobs!]) {
      await db.transaction((tx) => stageBodyContent(tx, { hash: bytesToHex(body.blob.sha256),
        byteLength: body.data.byteLength, chunks: chunks(body.data) }));
    }
    sqlite.close();
    sqlite = new Database(file);
    db = createBetterSqliteDbPort(sqlite);
    const queries: string[] = [];
    const observed = { ...db, query: async <T extends Record<string, unknown>>(sql: string, params?: Parameters<typeof db.query>[1]) => {
      queries.push(sql);
      return db.query<T>(sql, params);
    } };
    const restored = await restoreVerifiedFramedSyncNode(observed, fact);
    expect(restored.metadata).toEqual(restoreFramedSyncNodeMetadata(fact));
    expect(restored.metadata).not.toHaveProperty('body_text');
    expect(restored.metadata.snapshot).not.toHaveProperty('content');
    expect(restored.body).toMatchObject({ kind: 'readable', ref: { byteLength: 3 * 1024 * 1024,
      utf16Length: source.body_text!.length } });
    expect(restored.alternativeBodies.map((body) => body.hash)).toEqual([alternativeHash]);
    expect(queries).toHaveLength(2);
    expect(queries.every((sql) => !sql.includes('content_body_chunks'))).toBe(true);
    const encoded = projectVerifiedFramedSyncNode(restored);
    expect(canonicalManifestBytes({ facts: [encoded], blobs: encoded.blobs }))
      .toEqual(canonicalManifestBytes(projection.manifest));
    await db.run('DELETE FROM content_bodies WHERE hash = ?', [alternativeHash]);
    await expect(restoreVerifiedFramedSyncNode(db, fact)).rejects.toThrow('framed_sync_verified_body_unavailable');
  } finally { sqlite?.close(); await rm(root, { recursive: true, force: true }); }
});

it('retains retired version identity without inventing an empty readable body', async () => {
  const sqlite = new Database(':memory:');
  try {
    const source = record('');
    source.body_text = null;
    source.snapshot.content = null;
    source.snapshot.body_blob_hash = 'a'.repeat(64);
    const fact = projectFramedSyncNodeIdentityFact(source);
    const restored = await restoreVerifiedFramedSyncNode(createBetterSqliteDbPort(sqlite), fact);
    const metadata = { ...restoreFramedSyncNodeIdentityFact(fact) };
    delete metadata.body_text;
    const snapshotMetadata = { ...metadata.snapshot };
    delete snapshotMetadata.content;
    expect(restored).toEqual({ metadata: { ...metadata, snapshot: snapshotMetadata },
      body: { kind: 'retired' }, alternativeBodies: [] });
    expect(projectVerifiedFramedSyncNode(restored)).toEqual(fact);
  } finally { sqlite.close(); }
});
