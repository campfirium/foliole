// @vitest-environment node
import { expect, it } from 'vitest';

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../lib/core/database/bodyContentOwnerMigration.js';
import { readKeepImportItemCache, upsertKeepImportItemCache } from '../../lib/core/database/keepImportItemCache.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { textDevice } from './topicTextState.testSupport.js';

const input = { contentPreview: 'Preview', refreshedAt: '2026-10-07T00:00:00.000Z', ruleId: 'rule',
  sourceMtimeMs: 123, sourcePath: 'article.md', sourceSizeBytes: 456, title: 'Title', refreshError: 'original error' };

async function stableCache() {
  const host = textDevice();
  await host.db.transaction(async (tx) => {
    await migrateBodyContentStorage(tx); await migrateBodyContentOwners(tx, 'desktop');
  });
  host.sqlite.exec('DROP TABLE content_blob_data');
  return { ...host, driver: createBetterSqlite3Driver(host.sqlite) };
}

it.each(['', '\ufeff中😀\0文'.repeat(350000), null])('preserves cache content and metadata across rewrites using explicit chunked storage', async (content) => {
  const old = textDevice();
  const stable = await stableCache();
  const oldDriver = createBetterSqlite3Driver(old.sqlite);
  try {
    expect(readKeepImportItemCache(stable.driver, input.ruleId, input.sourcePath, 'chunked')).toBeNull();
    for (const next of [content, 'Replacement\0😀', null, content]) {
      upsertKeepImportItemCache(oldDriver, { ...input, content: next });
      upsertKeepImportItemCache(stable.driver, { ...input, content: next }, 'chunked');
      expect(readKeepImportItemCache(stable.driver, input.ruleId, input.sourcePath, 'chunked'))
        .toEqual(readKeepImportItemCache(oldDriver, input.ruleId, input.sourcePath));
      expect(stable.driver.queryOne('SELECT content, body_blob_hash FROM keep_import_item_cache'))
        .toEqual({ content: null, body_blob_hash: next === null ? null : hashTextBody(next) });
    }
    if (content === null) expect(stable.driver.queryOne('SELECT hash FROM content_bodies WHERE hash = ?', [hashTextBody('')]))
      .toBeUndefined();
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it('keeps original cache owner and rolls back body adoption when a rewrite rejects', async () => {
  const host = await stableCache();
  try {
    upsertKeepImportItemCache(host.driver, { ...input, content: 'Original' }, 'chunked');
    const before = readKeepImportItemCache(host.driver, input.ruleId, input.sourcePath, 'chunked');
    const bodies = host.driver.queryAll('SELECT * FROM content_bodies');
    const blobs = host.driver.queryAll('SELECT * FROM content_blobs');
    host.sqlite.exec(`CREATE TRIGGER reject_cache_write BEFORE UPDATE ON keep_import_item_cache
      BEGIN SELECT RAISE(ABORT, 'cache_write_rejected'); END`);
    expect(() => upsertKeepImportItemCache(host.driver, { ...input, content: '\ufeff中😀\0'.repeat(350000) }, 'chunked'))
      .toThrow('cache_write_rejected');
    expect(readKeepImportItemCache(host.driver, input.ruleId, input.sourcePath, 'chunked')).toEqual(before);
    expect(host.driver.queryAll('SELECT * FROM content_bodies')).toEqual(bodies);
    expect(host.driver.queryAll('SELECT * FROM content_blobs')).toEqual(blobs);
    expect(host.driver.queryOne('SELECT 1 FROM content_body_chunks WHERE hash = ?', [hashTextBody('\ufeff中😀\0'.repeat(350000))]))
      .toBeUndefined();
  } finally { host.sqlite.close(); }
});

it('refuses unavailable chunked content and missing hashes without reading old inline content', async () => {
  const host = await stableCache();
  try {
    upsertKeepImportItemCache(host.driver, { ...input, content: 'Original' }, 'chunked');
    host.driver.execute('DELETE FROM content_bodies');
    host.driver.execute('INSERT INTO content_bodies (hash, byte_length, verified) VALUES (?, 8, 0)', [hashTextBody('Original')]);
    expect(() => readKeepImportItemCache(host.driver, input.ruleId, input.sourcePath, 'chunked')).toThrow('body_content_unavailable');
    host.driver.execute("UPDATE keep_import_item_cache SET body_blob_hash = NULL, content = 'old inline'");
    expect(() => readKeepImportItemCache(host.driver, input.ruleId, input.sourcePath, 'chunked')).toThrow('body_content_unavailable');
    expect(readKeepImportItemCache(host.driver, input.ruleId, input.sourcePath)?.content).toBe('old inline');
  } finally { host.sqlite.close(); }
});

it('releases replaced cache bytes only after the last shared cache owner leaves', async () => {
  const host = await stableCache();
  try {
    const other = { ...input, sourcePath: 'other.md' };
    const hash = hashTextBody('Shared');
    upsertKeepImportItemCache(host.driver, { ...input, content: 'Shared' }, 'chunked');
    upsertKeepImportItemCache(host.driver, { ...other, content: 'Shared' }, 'chunked');
    upsertKeepImportItemCache(host.driver, { ...input, content: 'Replacement' }, 'chunked');
    expect(readKeepImportItemCache(host.driver, other.ruleId, other.sourcePath, 'chunked')?.content).toBe('Shared');
    upsertKeepImportItemCache(host.driver, { ...other, content: null }, 'chunked');
    expect(host.driver.queryOne('SELECT hash FROM content_bodies WHERE hash = ?', [hash])).toBeUndefined();
    expect(host.driver.queryOne('SELECT hash FROM content_blobs WHERE hash = ?', [hash])).toBeUndefined();
    expect(readKeepImportItemCache(host.driver, input.ruleId, input.sourcePath, 'chunked')?.content).toBe('Replacement');
  } finally { host.sqlite.close(); }
});
