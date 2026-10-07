// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { observeDriver } from '../database/bodyContentDriver.testSupport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { migrateImageAddressInNode } from './imageAddressMigrationNode.js';
import { learnRemoteImageSourceOrigin } from './remoteImageLearnedSources.js';
import { resolveRemoteImageSourceContext, resolveRemoteImageSourceOriginWithDriver } from './remoteImageSourceContext.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-remote-source-context-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function seedSourceChain() {
  const sqlite = openDatabaseConnection().sqlite;
  sqlite.prepare(`INSERT INTO nodes
    (id, parent_id, kind, title, content, anchor_link, created_at, updated_at)
    VALUES (?, ?, 'topic', ?, ?, ?, ?, ?)`).run(
    'parent-1', null, 'Parent', '---\nurl: https://frontmatter.example/article\n---', null,
    '2026-09-12T00:00:00.000Z', '2026-09-12T00:00:00.000Z'
  );
  sqlite.prepare(`INSERT INTO nodes
    (id, parent_id, kind, title, content, anchor_link, created_at, updated_at)
    VALUES (?, ?, 'item', ?, '', ?, ?, ?)`).run(
    'child-1', 'parent-1', 'Child', '{"kind":"highlight"}',
    '2026-09-12T00:00:00.000Z', '2026-09-12T00:00:00.000Z'
  );
  sqlite.prepare(`INSERT INTO import_sources
    (source_fingerprint, provider, source_kind, source_name, source_locator,
     first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id)
    VALUES ('source-1', 'desktop_text_file', 'markdown', 'source.md', ?, ?, ?, 'hash-1', 'parent-1')`)
    .run('https://import.example/article', '2026-09-12T00:00:00.000Z', '2026-09-12T00:00:00.000Z');
  sqlite.prepare(`INSERT INTO import_runs
    (id, source_fingerprint, provider, source_kind, source_name, source_locator,
     content_fingerprint, duplicate_semantic, result_status, node_id, imported_at)
    VALUES ('run-1', 'source-1', 'desktop_text_file', 'markdown', 'source.md', ?,
      'hash-1', 'new', 'imported', 'parent-1', '2026-09-12T00:00:00.000Z')`)
    .run('https://run.example/article');
  return sqlite;
}

it('preserves import source, run, derived-parent frontmatter, and learned priority', () => {
  const sqlite = seedSourceChain();
  const sourceUrl = 'https://cdn.example/image.png';
  learnRemoteImageSourceOrigin(sourceUrl, 'https://learned.example/article');

  expect(resolveRemoteImageSourceContext('child-1', sourceUrl)).toMatchObject({
    source: 'node', sourceOrigin: 'https://import.example/'
  });
  sqlite.prepare('DELETE FROM import_sources').run();
  expect(resolveRemoteImageSourceContext('child-1', sourceUrl)).toMatchObject({
    source: 'node', sourceOrigin: 'https://run.example/'
  });
  sqlite.prepare('DELETE FROM import_runs').run();
  expect(resolveRemoteImageSourceContext('child-1', sourceUrl)).toMatchObject({
    source: 'node', sourceOrigin: 'https://frontmatter.example/'
  });
  sqlite.prepare("UPDATE nodes SET content = '# No source' WHERE id = 'parent-1'").run();
  expect(resolveRemoteImageSourceContext('child-1', sourceUrl)).toMatchObject({
    source: 'learned', sourceOrigin: 'https://learned.example/'
  });
});

it('preserves single-article consumer results after explicit chunked migration without continuous or inline fallback', async () => {
  const { sqlite, driver } = openDatabaseConnection();
  const body = `---\nurl: https://body.example/article\n---\n${'中😀'.repeat(400_000)}`;
  const hash = upsertTextBodyBlob(driver, body, 'now');
  sqlite.prepare(`INSERT INTO nodes (id,kind,title,content,body_blob_hash,created_at,updated_at)
    VALUES ('article','topic','Title','stale inline',?,'now','now')`).run(hash);
  const image = { contentHash: 'a'.repeat(64), storageKey: `${'a'.repeat(64)}.png` };
  const expectedOrigin = resolveRemoteImageSourceOriginWithDriver(driver, 'article');
  const expectedChange = applyParentContentChange({ driver, nodeId: 'article', nextContent: body, updatedAt: 'now' });
  expect(migrateImageAddressInNode(driver, 'article', image, 'host', 'now')).toBe(false);
  await migrateBodyContentStorage(createBetterSqliteDbPort(sqlite));
  sqlite.prepare("UPDATE nodes SET content = 'stale inline' WHERE id = 'article'").run();
  const observed = observeDriver(driver);
  expect(resolveRemoteImageSourceOriginWithDriver(observed.driver, 'article', 'chunked')).toBe(expectedOrigin);
  expect(applyParentContentChange({ bodyStorage: 'chunked', driver: observed.driver,
    nodeId: 'article', nextContent: body, updatedAt: 'now' })).toEqual(expectedChange);
  expect(migrateImageAddressInNode(observed.driver, 'article', image, 'host', 'now', 'chunked')).toBe(false);
  expect(observed.sizes.length).toBeGreaterThan(0);
  sqlite.prepare('DELETE FROM content_bodies WHERE hash = ?').run(hash);
  expect(resolveRemoteImageSourceOriginWithDriver(driver, 'article', 'chunked')).toBeNull();
  expect(() => applyParentContentChange({ bodyStorage: 'chunked', driver, nodeId: 'article',
    nextContent: 'Replacement', previousContent: body, updatedAt: 'later' })).toThrow('node_body_unavailable:article');
  expect(() => migrateImageAddressInNode(driver, 'article', image, 'host', 'now', 'chunked'))
    .toThrow('image_migration_body_unavailable');
  expect(driver.queryOne<{ content: string }>("SELECT content FROM nodes WHERE id = 'article'")?.content).toBe('stale inline');
});
