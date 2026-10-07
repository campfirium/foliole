// @vitest-environment node
import { expect, it } from 'vitest';

import { contentPackFixture, observeChunkedPack, packTime } from '../../../electron/database/companionContentPack.testSupport.js';

import { applyCompanionContentPack } from './companionBatchDataPlane.js';
import { verifyStoredContentBlobBytes, type StoredContentBlobMeta } from './storedContentBlobIntegrity.js';

function state(host: ReturnType<typeof contentPackFixture>) {
  return {
    headers: host.sqlite.prepare('SELECT * FROM content_bodies ORDER BY hash').all(),
    chunks: host.sqlite.prepare('SELECT * FROM content_body_chunks ORDER BY hash, byte_offset').all(),
    manifests: host.sqlite.prepare('SELECT * FROM content_blobs ORDER BY hash').all(),
    changes: host.sqlite.prepare('SELECT total_changes()').pluck().get()
  };
}

function meta(host: ReturnType<typeof contentPackFixture>, hash: string) {
  return host.sqlite.prepare('SELECT hash, stored_sha256, stored_size_bytes FROM content_blobs WHERE hash = ?')
    .get(hash) as StoredContentBlobMeta;
}

async function adopt(host: ReturnType<typeof contentPackFixture>) {
  host.sqlite.pragma('foreign_keys = ON');
  await applyCompanionContentPack(host.db, { bodyStorage: 'chunked', failedHashes: [], now: packTime, packPath: host.path });
}

function replaceChunks(host: ReturnType<typeof contentPackFixture>, hash: string, kind: 'tamper' | 'missing' | 'extra') {
  const header = host.sqlite.prepare('SELECT * FROM content_bodies WHERE hash = ?').get(hash) as {
    hash: string; byte_length: number; frontmatter_end: number | null; utf16_length: number;
  };
  const chunks = host.sqlite.prepare('SELECT byte_offset, data FROM content_body_chunks WHERE hash = ? ORDER BY byte_offset')
    .all(hash) as { byte_offset: number; data: Buffer }[];
  host.sqlite.transaction(() => {
    host.sqlite.prepare('DELETE FROM content_bodies WHERE hash = ?').run(hash);
    host.sqlite.prepare('INSERT INTO content_bodies VALUES (?, ?, 0, ?, ?)')
      .run(hash, header.byte_length, header.utf16_length, header.frontmatter_end);
    for (const [index, chunk] of chunks.entries()) {
      if (kind === 'missing' && index === 0) continue;
      const data = Buffer.from(chunk.data);
      if (kind === 'tamper' && index === 0) data[0] = data[0]! ^ 1;
      host.sqlite.prepare('INSERT INTO content_body_chunks VALUES (?, ?, ?)').run(hash, chunk.byte_offset, data);
    }
    if (kind === 'extra') {
      host.sqlite.prepare('INSERT INTO content_body_chunks VALUES (?, ?, ?)')
        .run(hash, Math.ceil(header.byte_length / (512 * 1024)) * 512 * 1024, Buffer.from('extra'));
    }
    host.sqlite.prepare('UPDATE content_bodies SET verified = 1 WHERE hash = ?').run(hash);
  })();
}

it.each(['', '\ufeff中文🌿\0' + '正文😀'.repeat(400_000)])(
  'verifies the same original raw body across storage candidates without any database writes', async (body) => {
    const host = contentPackFixture([body]);
    try {
      const entry = host.entries[0]!;
      await applyCompanionContentPack(host.db, { failedHashes: [], now: packTime, packPath: host.path });
      const row = meta(host, entry.hash);
      const continuousBefore = state(host);
      expect(await verifyStoredContentBlobBytes(host.db, row)).toBe(true);
      expect(state(host)).toEqual(continuousBefore);
      await adopt(host);
      await host.db.run('DROP TABLE content_blob_data');
      const observed = observeChunkedPack(host.db);
      const before = state(host);
      expect(await verifyStoredContentBlobBytes(observed.db, row, 'chunked')).toBe(true);
      expect(state(host)).toEqual(before);
      expect(observed.sizes.every((size) => size <= 512 * 1024)).toBe(true);
      if (body) expect(observed.sizes.length).toBeGreaterThan(6);
      else expect(observed.sizes).toEqual([]);
    } finally { host.close(); }
  }
);

it.each(['tamper', 'missing', 'extra'] as const)(
  'rejects %s immutable-body corruption without repairing headers or chunks', async (kind) => {
    const host = contentPackFixture(['\ufeffFirst中文😀\0' + 'x'.repeat(600_000)]);
    try {
      await adopt(host);
      const hash = host.entries[0]!.hash;
      const row = meta(host, hash);
      replaceChunks(host, hash, kind);
      await host.db.run('DROP TABLE content_blob_data');
      const before = state(host);
      expect(await verifyStoredContentBlobBytes(observeChunkedPack(host.db).db, row, 'chunked')).toBe(false);
      expect(state(host)).toEqual(before);
    } finally { host.close(); }
  }
);

it('rejects wrong manifest identities and missing or unverified headers with no writes or continuous fallback', async () => {
  const host = contentPackFixture(['\ufeff原正文😀\0']);
  try {
    const hash = host.entries[0]!.hash;
    const original = meta(host, hash);
    const observed = observeChunkedPack(host.db);
    const missing = state(host);
    expect(await verifyStoredContentBlobBytes(observed.db, original, 'chunked')).toBe(false);
    expect(state(host)).toEqual(missing);
    await adopt(host);
    for (const sql of [
      "UPDATE content_blobs SET original_sha256 = 'wrong'",
      'UPDATE content_blobs SET original_size_bytes = original_size_bytes + 1',
      "UPDATE content_blobs SET compression = 'gzip'"
    ]) {
      host.sqlite.exec(sql);
      const before = state(host);
      expect(await verifyStoredContentBlobBytes(observed.db, original, 'chunked')).toBe(false);
      expect(state(host)).toEqual(before);
      host.sqlite.prepare("UPDATE content_blobs SET original_sha256 = ?, original_size_bytes = ?, compression = 'none'")
        .run(hash, original.stored_size_bytes);
    }
    expect(await verifyStoredContentBlobBytes(observed.db, { ...original, stored_sha256: 'f'.repeat(64) }, 'chunked')).toBe(false);
    host.sqlite.prepare('DELETE FROM content_bodies WHERE hash = ?').run(hash);
    host.sqlite.prepare('INSERT INTO content_bodies (hash, byte_length, verified) VALUES (?, ?, 0)').run(hash, original.stored_size_bytes);
    const before = state(host);
    expect(await verifyStoredContentBlobBytes(observed.db, original, 'chunked')).toBe(false);
    expect(state(host)).toEqual(before);
  } finally { host.close(); }
});
