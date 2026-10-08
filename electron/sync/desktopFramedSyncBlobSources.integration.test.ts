// @vitest-environment node
import { hexToBytes } from '@noble/hashes/utils.js';
import { expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import type { CanonicalManifest } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { stageFramedSyncFrozenBody } from '../../lib/core/sync/framedSyncFrozenBody.js';
import { textDevice } from '../database/topicTextState.testSupport.js';

import { loadDesktopFramedSyncPublishedBlobSources, type DesktopFramedSyncBlobSource } from './desktopFramedSyncBlobSources.js';

async function collected(source: DesktopFramedSyncBlobSource) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source.chunks()) {
    expect(chunk.byteLength).toBeLessThanOrEqual(1048576);
    chunks.push(chunk);
  }
  expect(chunks.length).toBeLessThanOrEqual(1);
  return Buffer.concat(chunks);
}

function boundedPort(db: DbPort): DbPort {
  return { ...db, query: async <T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) => {
    if (sql.includes('content_blob_data')) throw new Error('unexpected_obsolete_body_query');
    const rows = await db.query<T>(sql, params);
    expect(rows.length).toBeLessThanOrEqual(1);
    for (const row of rows) if (row.data instanceof Uint8Array) expect(row.data.byteLength).toBeLessThanOrEqual(1048576);
    return rows;
  } };
}

async function seeded(body: string, role: number) {
  const host = textDevice();
  const hash = hashTextBody(body);
  const manifest: CanonicalManifest = { facts: [], blobs: [
    { byteLength: BigInt(Buffer.byteLength(body)), required: true, role, sha256: hexToBytes(hash) }
  ] };
  await stageFramedSyncFrozenBody(host.db, manifest.blobs[0]!, Buffer.from(body));
  host.sqlite.exec('DROP TABLE content_blob_data');
  return { ...host, hash, manifest };
}

it.each([1, 5])('reads exact full frozen role %s bytes without obsolete shared storage', async (role) => {
  for (const body of ['', '\ufeff---\r\nkey: 中文😀\0\r\n---\r\n' + '中😀'.repeat(100_000), 'x'.repeat(1048576)]) {
    const host = await seeded(body, role);
    try {
      const sources = await loadDesktopFramedSyncPublishedBlobSources(boundedPort(host.db), host.manifest);
      expect(sources).toHaveLength(1);
      expect(sources[0]!.blob).toEqual(host.manifest.blobs[0]);
      expect((await collected(sources[0]!)).equals(Buffer.from(body))).toBe(true);
    } finally { host.sqlite.close(); }
  }
});

it.each(['header', 'length', 'bytes'] as const)('rejects unavailable frozen published body: %s', async (failure) => {
  const host = await seeded('Original body', 1);
  try {
    const blob = host.manifest.blobs[0]!;
    const manifest = { ...host.manifest, blobs: [{ ...blob,
      ...(failure === 'header' ? { sha256: hexToBytes(hashTextBody('missing')) } : {}),
      ...(failure === 'length' ? { byteLength: blob.byteLength + 1n } : {})
    }] };
    if (failure === 'bytes') {
      host.sqlite.exec('UPDATE framed_sync_available_blobs SET data = zeroblob(length(data))');
      const sources = await loadDesktopFramedSyncPublishedBlobSources(boundedPort(host.db), manifest);
      await expect(collected(sources[0]!)).rejects.toThrow('framed_sync_published_body_unavailable');
    } else {
      await expect(loadDesktopFramedSyncPublishedBlobSources(boundedPort(host.db), manifest))
        .rejects.toThrow('framed_sync_published_body_unavailable');
    }
  } finally { host.sqlite.close(); }
});
