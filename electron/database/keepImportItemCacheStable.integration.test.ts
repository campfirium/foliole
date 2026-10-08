// @vitest-environment node
import { expect, it } from 'vitest';

import { readKeepImportItemCache, upsertKeepImportItemCache } from '../../lib/core/database/keepImportItemCache.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { textDevice } from './topicTextState.testSupport.js';

const input = { contentPreview: 'Preview', refreshedAt: '2026-10-08T00:00:00.000Z', ruleId: 'rule',
  sourceMtimeMs: 123, sourcePath: 'article.md', sourceSizeBytes: 456, title: 'Title', refreshError: 'original error' };

it.each(['', '\ufeff中😀\0owned', '中😀'.repeat(149796) + 'abcd', null])('preserves complete cache text, nullability and metadata across rewrites', (content) => {
  const host = textDevice();
  const driver = createBetterSqlite3Driver(host.sqlite);
  try {
    host.sqlite.exec('DROP TABLE content_blob_data');
    expect(readKeepImportItemCache(driver, input.ruleId, input.sourcePath)).toBeNull();
    for (const next of [content, 'Replacement\0😀', null, content]) {
      upsertKeepImportItemCache(driver, { ...input, content: next });
      expect(readKeepImportItemCache(driver, input.ruleId, input.sourcePath)).toEqual({
        content: next, content_preview: input.contentPreview, refreshed_at: input.refreshedAt,
        refresh_error: input.refreshError, rule_id: input.ruleId, source_path: input.sourcePath,
        source_mtime_ms: input.sourceMtimeMs, source_size_bytes: input.sourceSizeBytes, title: input.title
      });
    }
  } finally { host.sqlite.close(); }
});

it('keeps the complete original cache and metadata when a rewrite rejects', () => {
  const host = textDevice();
  const driver = createBetterSqlite3Driver(host.sqlite);
  try {
    upsertKeepImportItemCache(driver, { ...input, content: 'Original' });
    const before = readKeepImportItemCache(driver, input.ruleId, input.sourcePath);
    host.sqlite.exec(`CREATE TRIGGER reject_cache_write BEFORE UPDATE ON keep_import_item_cache
      BEGIN SELECT RAISE(ABORT, 'cache_write_rejected'); END`);
    expect(() => upsertKeepImportItemCache(driver, { ...input, content: '中😀'.repeat(149796) + 'abcd' }))
      .toThrow('cache_write_rejected');
    expect(readKeepImportItemCache(driver, input.ruleId, input.sourcePath)).toEqual(before);
    expect(host.sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
  } finally { host.sqlite.close(); }
});

it('replaces or removes one cache body without changing another source with the same text', () => {
  const host = textDevice();
  const driver = createBetterSqlite3Driver(host.sqlite);
  try {
    const other = { ...input, sourcePath: 'other.md' };
    upsertKeepImportItemCache(driver, { ...input, content: 'Shared' });
    upsertKeepImportItemCache(driver, { ...other, content: 'Shared' });
    upsertKeepImportItemCache(driver, { ...input, content: 'Replacement' });
    expect(readKeepImportItemCache(driver, other.ruleId, other.sourcePath)?.content).toBe('Shared');
    upsertKeepImportItemCache(driver, { ...other, content: null });
    expect(readKeepImportItemCache(driver, other.ruleId, other.sourcePath)?.content).toBeNull();
    expect(readKeepImportItemCache(driver, input.ruleId, input.sourcePath)?.content).toBe('Replacement');
  } finally { host.sqlite.close(); }
});
