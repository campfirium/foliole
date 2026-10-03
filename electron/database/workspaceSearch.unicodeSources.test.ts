// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { serializeReadwiseExternalReference } from '../../lib/core/readwise/readwiseExternalReference.js';

let tempRoot = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: path.join(tempRoot, 'data'), app_cache_dir: path.join(tempRoot, 'cache'),
  app_config_dir: path.join(tempRoot, 'config'), app_log_dir: path.join(tempRoot, 'logs')
}) }));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { upsertExternalDocuments } from './externalDocuments.js';
import { searchExternalDocuments } from './externalSearchCache.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { loadExternalSearchFolders, saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';
import { beginWorkspaceSearch } from './workspaceSearchSnapshot.js';

const stamp = '2026-10-03T00:00:00.000Z';
const readwiseFolder = 'readwise-reader-import-articles';

function seedText(text: string) {
  const folder = loadExternalSearchFolders()[0]!;
  for (const [id, file] of [['mirror', 'mirror.md'], [readwiseFolder, 'readwise.md']] as const) {
    upsertExternalDocuments({ ...folder, id }, [{ absolutePath: path.join(tempRoot, file),
      content: `# ${text}\nmarker`, extension: 'md', fileName: file, modifiedAt: stamp,
      modifiedMs: 1, relativePath: file, sizeBytes: 30 }], stamp);
  }
  const { driver } = openDatabaseConnection();
  driver.execute(`UPDATE external_documents SET reference_kind = 'readwise_remote', reference_json = ?
    WHERE folder_id = ?`, [serializeReadwiseExternalReference({ connection_ref: 'fixture',
    remote_document_id: 'remote-doc', reader_url: null, source_url: null }), readwiseFolder]);
  driver.execute(`UPDATE keep_import_item_cache SET title = ?, content = ?, content_preview = ?
    WHERE rule_id = 'rule'`, [text, `${text} marker`, text]);
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-unicode-sources-'));
  initializeDatabase();
  saveExternalSearchFolders([{ id: 'mirror', folder_path: path.join(tempRoot, 'source'),
    attachment_mode: 'document_relative_first_then_fixed_root', attachment_root_path: null, excluded_dirs: [] }]);
  const { driver } = openDatabaseConnection();
  driver.execute("UPDATE desktop_sources SET host_name = 'other-host' WHERE config_ref = 'mirror'");
  driver.execute(`INSERT INTO keep_import_items (rule_id, source_path, source_mtime_ms, source_size_bytes,
    source_state, local_node_state, last_status, first_seen_at, last_seen_at)
    VALUES ('rule', '/Missing/retained.md', 1, 1, 'present', 'locally_deleted', 'blocked_deleted', 'now', 'now')`);
  driver.execute(`INSERT INTO keep_import_item_cache (rule_id, source_path, title, content, content_preview,
    source_mtime_ms, source_size_bytes, refreshed_at)
    VALUES ('rule', '/Missing/retained.md', 'Initial', 'Initial', 'Initial', 1, 1, 'now')`);
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it.each([
  ['ПРИМЕР', 'рим'], ['ΠΑΡΑΔΕΙΓΜΑ', 'ραδ'], ['пример', 'рим'], ['παραδειγμα', 'ραδ'], ['EXAMPLE', 'amp']
])('recalls source substrings and query controls for %s through the production snapshot', (text, part) => {
  seedText(text);
  for (const query of [part, part.toUpperCase(), text.toLowerCase(), `"${part}"`, `${part} marker`,
    `${part} AND marker`, `${part} NOT absent`, `${part} OR absent`]) {
    const snapshot = beginWorkspaceSearch(query);
    expect(snapshot.results.map((row) => row.id).sort(), query).toEqual([
      'mirror-document:mirror:mirror.md', `readwise-document:${readwiseFolder}:readwise.md`,
      'rule:/Missing/retained.md'
    ].sort());
    expect(snapshot.hasMore, query).toBe(false);
  }
  expect(beginWorkspaceSearch(`${part} NOT marker`).results).toEqual([]);
  expect(beginWorkspaceSearch(`${part} AND absent`).results).toEqual([]);
  expect(searchExternalDocuments('aliaswhole', [['aliaswhole', text.toLowerCase()]])).toHaveLength(2);
  expect(searchExternalDocuments('aliaspart', [['aliaspart', part]])).toHaveLength(text === 'EXAMPLE' ? 0 : 2);
});

it('uses the current stored text after replacement and after reopening the connection', () => {
  seedText('ПРИМЕР');
  expect(beginWorkspaceSearch('рим').results).toHaveLength(3);
  seedText('ΠΑΡΑΔΕΙΓΜΑ');
  expect(beginWorkspaceSearch('рим').results).toEqual([]);
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  expect(beginWorkspaceSearch('ραδ').results).toHaveLength(3);
});
