// @vitest-environment node
import { expect, it } from 'vitest';

import { contentPackFixture, packTime } from '../../../electron/database/companionContentPack.testSupport.js';

import { applyCompanionContentPack } from './companionBatchDataPlane.js';
import type { DbPort, DbRow } from './dbPort.js';
import { verifyStoredContentBlobBytes, type StoredContentBlobMeta } from './storedContentBlobIntegrity.js';

function observeReads(db: DbPort) {
  const sizes: number[] = [];
  return { sizes, port: { ...db,
    query: async <T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) => {
      const rows = await db.query<T>(sql, params);
      for (const row of rows) for (const value of Object.values(row)) {
        if (typeof value === 'string') sizes.push(Buffer.byteLength(value));
        if (value instanceof Uint8Array) sizes.push(value.byteLength);
      }
      return rows;
    }
  } satisfies DbPort };
}

async function fixture(body: string) {
  const host = contentPackFixture([body]);
  await applyCompanionContentPack(host.db, { failedHashes: [], now: packTime, packPath: host.path });
  const entry = host.entries[0]!;
  const meta: StoredContentBlobMeta = {
    hash: entry.hash, stored_sha256: entry.hash, stored_size_bytes: entry.bytes.byteLength
  };
  return { ...host, meta };
}

it.each(['', '\ufeff中文🌿\0' + '正文😀'.repeat(70_000)])(
  'verifies original legacy bytes through bounded reads without changing the stored value', async (body) => {
    const host = await fixture(body);
    try {
      const observed = observeReads(host.db);
      const before = host.sqlite.prepare('SELECT total_changes()').pluck().get();
      expect(await verifyStoredContentBlobBytes(observed.port, host.meta)).toBe(true);
      expect(host.sqlite.prepare('SELECT total_changes()').pluck().get()).toBe(before);
      expect(host.sqlite.prepare('SELECT data FROM content_blob_data WHERE hash = ?').pluck().get(host.meta.hash))
        .toEqual(Buffer.from(body));
      expect(Math.max(0, ...observed.sizes)).toBeLessThanOrEqual(512 * 1024);
      if (body) expect(observed.sizes.length).toBeGreaterThan(1);
    } finally { host.close(); }
  }
);

it.each(['tamper', 'missing', 'extra'] as const)(
  'rejects %s cached bytes without repairing or replacing the original evidence', async (kind) => {
    const host = await fixture('\ufeffFirst中文😀\0' + 'x'.repeat(600_000));
    try {
      const bytes = Buffer.from(host.entries[0]!.bytes);
      if (kind === 'missing') host.sqlite.prepare('DELETE FROM content_blob_data WHERE hash = ?').run(host.meta.hash);
      else {
        if (kind === 'tamper') bytes[0] = bytes[0]! ^ 1;
        host.sqlite.prepare('UPDATE content_blob_data SET data = ? WHERE hash = ?')
          .run(kind === 'extra' ? Buffer.concat([bytes, Buffer.from('extra')]) : bytes, host.meta.hash);
      }
      const before = host.sqlite.prepare('SELECT * FROM content_blob_data').all();
      const changes = host.sqlite.prepare('SELECT total_changes()').pluck().get();
      expect(await verifyStoredContentBlobBytes(observeReads(host.db).port, host.meta)).toBe(false);
      expect(host.sqlite.prepare('SELECT * FROM content_blob_data').all()).toEqual(before);
      expect(host.sqlite.prepare('SELECT total_changes()').pluck().get()).toBe(changes);
    } finally { host.close(); }
  }
);

it.each([
  { stored_sha256: 'f'.repeat(64) }, { stored_size_bytes: -1 },
  { stored_size_bytes: 1.5 }, { stored_size_bytes: 1 }
])('rejects contradictory metadata without database writes', async (change) => {
  const host = await fixture('\ufeff原正文😀\0');
  try {
    const before = host.sqlite.prepare('SELECT total_changes()').pluck().get();
    expect(await verifyStoredContentBlobBytes(host.db, { ...host.meta, ...change })).toBe(false);
    expect(host.sqlite.prepare('SELECT total_changes()').pluck().get()).toBe(before);
  } finally { host.close(); }
});
