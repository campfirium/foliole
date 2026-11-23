// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-aide-read-scope-tests';

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return false;
    },
    getPath: () => mockedAppDataDir,
    getAppPath: () => '/tmp/foliole-app-root',
    getVersion: () => '0.6.5-test'
  }
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { normalizeAideToolPermissionSettings } from '../../lib/core/assistant/aideToolPermissionSettings.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { AGENT_CONTROL_CAPABILITIES, AGENT_CONTROL_PROTOCOL_VERSION } from '../agentControl/agentControlTypes.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase, openExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';

import { checkAideReadTarget, filterAideReadResult } from './aideReadScope.js';
import { executeAideTool } from './aideToolExecutor.js';
import { createAideToolSession } from './aideToolSession.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-aide-read-scope-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

const descriptor = {
  capabilities: [...AGENT_CONTROL_CAPABILITIES],
  endpoint: 'http://127.0.0.1:1',
  pid: 1,
  protocol_version: AGENT_CONTROL_PROTOCOL_VERSION as 1,
  runtime_identity: { boot_id: 'boot', database_device_id_hash: null, pid: 1, started_at: 'now' },
  started_at: 'now',
  token: 'secret'
};

// Books (a top-level folder) holds a book with an excerpt and a highlight of it, another book and a trashed one;
// Shelf is a second top-level folder.
function seedLibrary() {
  const insert = openDatabaseConnection().sqlite.prepare(`INSERT INTO nodes (id, parent_id, kind, title, content, anchor_link, deleted_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'text', ?, ?, 'now', 'now')`);
  const anchor = (id: string) => JSON.stringify({ id, kind: 'highlight', locator: { from: 0, originalText: 'text', to: 4 } });
  insert.run('folder', null, 'folder', 'Books', null, null);
  insert.run('book', 'folder', 'topic', 'The Wealth of Nations', null, null);
  insert.run('excerpt', 'book', 'topic', 'Division of labour', anchor('a1'), null);
  insert.run('highlight', 'excerpt', 'topic', 'Raises output', anchor('a2'), null);
  insert.run('other', 'folder', 'topic', 'Another book', null, null);
  insert.run('gone', 'folder', 'topic', 'A deleted book', null, 'now');
  insert.run('shelf', null, 'folder', 'Shelf', null, null);
  insert.run('far', 'shelf', 'topic', 'A book on another shelf', null, null);
}

const NO_PLACES = { baseTopic: false, current: false, dives: false, external: false, folder: false, home: false, trash: false, virtual: false };

async function readInScope(id: string, read: Record<string, boolean>) {
  const session = createAideToolSession(normalizeAideToolPermissionSettings({ read: { ...NO_PLACES, ...read } }), undefined, ['highlight']);
  const result = await executeAideTool({ arguments: { id }, tool: 'read_material' }, { descriptor, session });
  return (JSON.parse(result.contentItems[0]?.text ?? '{}') as { error?: string }).error ?? 'read';
}

it('reads a material only when a switched-on place holds it', async () => {
  seedLibrary();
  // Folders opens only the top-level folder the current material sits in; a trashed material is read through Trash alone.
  const cases: Array<[string, Record<string, boolean>, string]> = [
    ['highlight', { current: true }, 'read'], ['highlight', {}, 'outside_read_scope'], ['book', { current: true }, 'outside_read_scope'],
    ['book', { baseTopic: true }, 'read'], ['excerpt', { baseTopic: true }, 'read'], ['other', { baseTopic: true }, 'outside_read_scope'],
    ['other', { folder: true }, 'read'], ['far', { folder: true }, 'outside_read_scope'], ['far', { home: true }, 'read'],
    ['gone', { folder: true, home: true }, 'outside_read_scope'], ['gone', { trash: true }, 'read']
  ];
  for (const [id, read, expected] of cases) expect([id, read, await readInScope(id, read)]).toEqual([id, read, expected]);
});

it('keeps listings and search results to the switched-on places', async () => {
  seedLibrary();
  const session = createAideToolSession(normalizeAideToolPermissionSettings({ read: { ...NO_PLACES, folder: true } }), undefined, ['highlight']);
  const scope = session.readScope!;
  expect(await checkAideReadTarget(scope, 'list_folder', {})).toBe('outside_read_scope');
  expect(await checkAideReadTarget(scope, 'list_folder', { parent_id: 'folder' })).toBeNull();
  expect(await checkAideReadTarget(scope, 'list_folder', { parent_id: 'shelf' })).toBe('outside_read_scope');
  const found = await filterAideReadResult(scope, 'search_materials', { count: 4, results: [
    { id: 'book', kind: 'topic' }, { id: 'far', kind: 'topic' }, { id: 'ext-1', kind: 'external' }, { id: 'old', kind: 'removed' }
  ] });
  expect(found).toEqual({ count: 1, results: [{ id: 'book', kind: 'topic' }] });
});

it('reads an External document by its path in segments, only while External is on', async () => {
  openExternalSearchCacheDatabase().prepare(`INSERT INTO external_search_documents (
    absolute_path, folder_id, folder_path, relative_path, file_name, extension, size_bytes, modified_at, modified_ms, indexed_at, is_present, content
  ) VALUES ('/notes/plan.md', 'f1', '/notes', 'plan.md', 'plan.md', 'md', 12, 'now', 0, 'now', 1, 'Plan of work')`).run();
  const read = async (external: boolean) => {
    const session = createAideToolSession(normalizeAideToolPermissionSettings({ read: { ...NO_PLACES, external } }), undefined, []);
    const result = await executeAideTool({ arguments: { length: 4, path: '/notes/plan.md' }, tool: 'read_external_document' }, { descriptor, session });
    return JSON.parse(result.contentItems[0]?.text ?? '{}') as Record<string, unknown>;
  };
  expect(await read(true)).toMatchObject({ document: { content: 'Plan', content_end: 4, path: '/notes/plan.md', relative_path: 'plan.md' } });
  expect((await read(false)).error).toBe('outside_read_scope');
});
