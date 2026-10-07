// @vitest-environment node

import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { BODY_CONTENT_CHUNK_BYTES, BODY_CONTENT_SCHEMA } from '../database/bodyContentSchema.js';

import { stageBodyContent } from './bodyContentWrite.js';
import type { DbPort, DbRow } from './dbPort.js';
import type { FramedSyncNodeMetadata } from './framedSyncNodeRestore.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { buildResolutionRecord } from './syncNodeResolution.js';
import { buildVerifiedResolutionRecord } from './syncNodeResolutionBody.js';
import type { VerifiedBodyRef } from './verifiedBody.js';

function record(version: string, body: string): NativeSyncNodeRecord {
  const time = '2026-10-07T00:00:00.000Z';
  return {
    ancestor_version_ids: ['older', 'base'], body_text: body, content_hash: version,
    host_name: version, object_id: 'topic', object_type: 'node', parent_version_id: 'base',
    snapshot: { id: 'topic', content: body, title: 'Title\n"\\😀', attachments: [
      { attachment_id: 'b', role: 'image' }, { attachment_id: 'a', role: 'image' }
    ], body_blob_hash: null, created_at: time, updated_at: time,
    enable_short_term: false, text_selection: { version_id: 'base', created_at: time }
    } as NativeSyncNodeRecord['snapshot'],
    updated_at: time, version_created_at: time, version_id: version
  };
}

function metadata(record: NativeSyncNodeRecord): FramedSyncNodeMetadata {
  const fields = { ...record };
  delete fields.body_text;
  delete fields.alternative_bodies;
  const snapshot = { ...record.snapshot };
  delete snapshot.content;
  return { ...fields, snapshot };
}

function verified(record: NativeSyncNodeRecord, ref: VerifiedBodyRef): VerifiedFramedSyncNode {
  return { metadata: metadata(record), body: { kind: 'readable', ref }, alternativeBodies: [] };
}

async function* chunks(data: Uint8Array) {
  for (let offset = 0; offset < data.byteLength; offset += BODY_CONTENT_CHUNK_BYTES) {
    yield data.subarray(offset, offset + BODY_CONTENT_CHUNK_BYTES);
  }
}

it.each([
  '', '\ufeffLine\r\n"\\\t\u0000中😀\u2028\u2029',
  '\u0000'.repeat(3 * 1024 * 1024),
  'x'.repeat(8191) + '😀' + 'y'.repeat(BODY_CONTENT_CHUNK_BYTES - 8198) + '中😀tail'
])('preserves exact resolution identity while reading stored bodies in bounded ranges', async (body) => {
  const sqlite = new Database(':memory:');
  try {
    for (const sql of BODY_CONTENT_SCHEMA) sqlite.exec(sql);
    const db = createBetterSqliteDbPort(sqlite);
    const data = Buffer.from(body);
    const ref = await db.transaction((tx) => stageBodyContent(tx, {
      hash: createHash('sha256').update(data).digest('hex'), byteLength: data.byteLength, chunks: chunks(data)
    }));
    const a = record('a', body);
    const b = record('b', body);
    const expected = buildResolutionRecord([a, b], a, body);
    const first = verified(a, ref);
    const second = verified(b, ref);
    let largestRead = 0;
    let totalRead = 0;
    const observed: DbPort = { ...db, query: async <T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) => {
      const rows = await db.query<T>(sql, params);
      for (const row of rows) {
        if (row.data instanceof Uint8Array) {
          largestRead = Math.max(largestRead, row.data.byteLength);
          totalRead += row.data.byteLength;
        }
      }
      return rows;
    } };
    const actual = await buildVerifiedResolutionRecord(observed, [second, first], first, ref);
    expect(actual.metadata).toEqual(metadata(expected));
    expect(actual.body).toEqual({ kind: 'readable', ref });
    expect(actual.metadata).not.toHaveProperty('body_text');
    expect(actual.metadata.snapshot).not.toHaveProperty('content');
    expect(largestRead).toBeLessThanOrEqual(BODY_CONTENT_CHUNK_BYTES);
    expect(totalRead).toBe(2 * data.byteLength);
    const renamed = { ...first, metadata: { ...first.metadata, snapshot: { ...first.metadata.snapshot, title: 'Renamed' } } };
    const renamedResult = await buildVerifiedResolutionRecord(db, [first, second], renamed, ref);
    expect(renamedResult.metadata.version_id).not.toBe(actual.metadata.version_id);
    expect(renamedResult.metadata.content_hash).toBe(
      buildResolutionRecord([a, b], { ...a, snapshot: { ...a.snapshot, title: 'Renamed' } }, body).content_hash
    );
  } finally { sqlite.close(); }
});

it('does not resolve a missing stored chunk or invalid parent timestamp into an identity', async () => {
  const sqlite = new Database(':memory:');
  try {
    for (const sql of BODY_CONTENT_SCHEMA) sqlite.exec(sql);
    const db = createBetterSqliteDbPort(sqlite);
    const data = Buffer.from('body');
    const ref = await db.transaction((tx) => stageBodyContent(tx, {
      hash: createHash('sha256').update(data).digest('hex'), byteLength: 4, chunks: chunks(data)
    }));
    const source = verified(record('a', 'body'), ref);
    const invalid = { ...source, metadata: { ...source.metadata, version_created_at: 'invalid' } };
    await expect(buildVerifiedResolutionRecord(db, [invalid], source, ref)).rejects.toThrow('sync_resolution_timestamp_invalid');
    await db.run('DELETE FROM content_bodies WHERE hash = ?', [ref.hash]);
    await expect(buildVerifiedResolutionRecord(db, [source], source, ref)).rejects.toThrow('body_content_unavailable');
  } finally { sqlite.close(); }
});
