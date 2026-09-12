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

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { learnRemoteImageSourceOrigin } from './remoteImageLearnedSources.js';
import { resolveRemoteImageSourceContext } from './remoteImageSourceContext.js';

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
