// @vitest-environment node
import { hexToBytes } from '@noble/hashes/utils.js';
import { expect, it } from 'vitest';

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import type { CanonicalManifest } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { textDevice } from '../database/topicTextState.testSupport.js';

import { loadDesktopFramedSyncPublishedBlobSources, type DesktopFramedSyncBlobSource } from './desktopFramedSyncBlobSources.js';

const timestamp = '2026-10-07T00:00:00Z';

async function collected(source: DesktopFramedSyncBlobSource) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source.chunks()) {
    expect(chunk.byteLength).toBeLessThanOrEqual(512 * 1024);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function boundedPort(db: DbPort): DbPort {
  return { ...db, query: async <T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) => {
    if (sql.includes('content_blob_data')) throw new Error('unexpected_continuous_body_query');
    const rows = await db.query<T>(sql, params);
    expect(rows.length).toBeLessThanOrEqual(1);
    for (const row of rows) if (row.data instanceof Uint8Array) expect(row.data.byteLength).toBeLessThanOrEqual(512 * 1024);
    return rows;
  } };
}

async function seeded(body: string, role: number) {
  const host = textDevice();
  const hash = hashTextBody(body);
  await upsertTextBodyBlob(host.db, body, timestamp, hash);
  const manifest: CanonicalManifest = { facts: [], blobs: [
    { byteLength: BigInt(Buffer.byteLength(body)), required: true, role, sha256: hexToBytes(hash) }
  ] };
  return { ...host, hash, manifest };
}

it.each([1, 5])('streams exact migrated role %s bytes with bounded reads for empty and long Unicode bodies', async (role) => {
  for (const body of ['', '\ufeff---\r\nkey: 中文😀\0\r\n---\r\n' + '中😀'.repeat(600_000)]) {
    const host = await seeded(body, role);
    try {
      const old = await loadDesktopFramedSyncPublishedBlobSources(host.db, host.manifest);
      const expected = await collected(old[0]!);
      await migrateBodyContentStorage(host.db);
      host.sqlite.exec('DROP TABLE content_blob_data');
      const stable = await loadDesktopFramedSyncPublishedBlobSources(boundedPort(host.db), host.manifest, 'chunked');
      expect(stable[0]!.blob).toEqual(old[0]!.blob);
      expect((await collected(stable[0]!)).equals(expected)).toBe(true);
      expect(expected.equals(Buffer.from(body))).toBe(true);
      await expect(loadDesktopFramedSyncPublishedBlobSources(host.db, host.manifest)).rejects.toThrow('no such table: content_blob_data');
    } finally { host.sqlite.close(); }
  }
});

it.each(['header', 'length', 'chunk'])('rejects unavailable published stable body: %s', async (failure) => {
  const host = await seeded('Original body', 1);
  try {
    await migrateBodyContentStorage(host.db);
    host.sqlite.exec('DROP TABLE content_blob_data');
    const blob = host.manifest.blobs[0]!;
    const manifest = { ...host.manifest, blobs: [{ ...blob,
      ...(failure === 'header' ? { sha256: hexToBytes(hashTextBody('missing')) } : {}),
      ...(failure === 'length' ? { byteLength: blob.byteLength + 1n } : {})
    }] };
    if (failure === 'chunk') {
      host.sqlite.exec('DROP TRIGGER content_body_chunks_immutable_delete');
      host.sqlite.prepare('DELETE FROM content_body_chunks WHERE hash = ?').run(host.hash);
    }
    if (failure === 'chunk') {
      const sources = await loadDesktopFramedSyncPublishedBlobSources(boundedPort(host.db), manifest, 'chunked');
      await expect(collected(sources[0]!)).rejects.toThrow('body_content_unavailable');
    } else {
      await expect(loadDesktopFramedSyncPublishedBlobSources(boundedPort(host.db), manifest, 'chunked'))
        .rejects.toThrow('framed_sync_published_body_unavailable');
    }
  } finally { host.sqlite.close(); }
});
