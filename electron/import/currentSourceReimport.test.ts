// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-current-source-reimport-tests';
const { notifyManagedInboxUpdated } = vi.hoisted(() => ({
  notifyManagedInboxUpdated: vi.fn()
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('./managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated
}));

import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { reimportCurrentTopicSource } from './currentSourceReimport.js';
import { saveImportManagerSettings } from './importManagerSettings.js';
import { runKeepImportRule } from './keepImportService.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-current-source-reimport-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  notifyManagedInboxUpdated.mockReset();
});

function saveGenericKeepSettings(sourceDir: string) {
  saveImportManagerSettings({
    sources: [
      {
        actionMode: 'keep',
        archivePath: '',
        highlightMode: 'merged',
        highlightPath: '',
        id: 'draft-import-source-401',
        keepPreview: null,
        keepState: 'enabled',
        primaryPath: sourceDir
      }
    ]
  });
}

it('reimports an updated keep source into the same active topic', async () => {
  const sourceDir = path.join(tempRoot, 'watched-source');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'entry.md'), '# Entry\n\nOld body\n', 'utf8');
  saveGenericKeepSettings(sourceDir);

  await runKeepImportRule({
    directoryPath: sourceDir,
    highlightPolicy: 'adopt',
    ruleId: 'draft-import-source-401'
  });

  const connection = openDatabaseConnection();
  const first = connection.sqlite
    .prepare(`SELECT last_node_id FROM keep_import_items WHERE rule_id = ? AND source_path = ?`)
    .get('draft-import-source-401', 'entry.md') as { last_node_id: string };

  await fs.writeFile(path.join(sourceDir, 'entry.md'), '# Entry\n\nFresh body\n', 'utf8');

  const result = await reimportCurrentTopicSource(first.last_node_id);
  const node = connection.sqlite
    .prepare('SELECT content, deleted_at FROM nodes WHERE id = ?')
    .get(first.last_node_id) as { content: string; deleted_at: string | null };
  const keepItem = connection.sqlite
    .prepare(
      `SELECT has_source_update, last_node_id, last_status, local_node_state
       FROM keep_import_items
       WHERE rule_id = ? AND source_path = ?`
    )
    .get('draft-import-source-401', 'entry.md');

  expect(result).toMatchObject({
    node_id: first.last_node_id,
    status: 'reimported'
  });
  expect(node).toEqual({ content: '# Entry\n\nFresh body\n', deleted_at: null });
  expect(keepItem).toMatchObject({
    has_source_update: 0,
    last_node_id: first.last_node_id,
    last_status: 'imported',
    local_node_state: 'active'
  });
});

it('overwrites local article edits even when the source file is unchanged', async () => {
  const sourceDir = path.join(tempRoot, 'watched-source');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'entry.md'), '# Entry\n\nSource body\n', 'utf8');
  saveGenericKeepSettings(sourceDir);

  await runKeepImportRule({
    directoryPath: sourceDir,
    highlightPolicy: 'adopt',
    ruleId: 'draft-import-source-401'
  });

  const connection = openDatabaseConnection();
  const first = connection.sqlite
    .prepare(`SELECT last_node_id FROM keep_import_items WHERE rule_id = ? AND source_path = ?`)
    .get('draft-import-source-401', 'entry.md') as { last_node_id: string };

  writeNodeBody({
    content: '# Entry\n\nEdited in app\n',
    driver: connection.driver,
    nodeId: first.last_node_id,
    title: 'Entry',
    updatedAt: new Date().toISOString()
  });

  const result = await reimportCurrentTopicSource(first.last_node_id);
  const body = loadNodeBodyResolution(connection.driver, first.last_node_id);
  const node = connection.sqlite
    .prepare('SELECT deleted_at FROM nodes WHERE id = ?')
    .get(first.last_node_id) as { deleted_at: string | null };
  const latestRun = connection.sqlite
    .prepare(
      `SELECT duplicate_semantic, node_id, result_status
       FROM import_runs
       WHERE node_id = ?
       ORDER BY imported_at DESC
       LIMIT 1`
    )
    .get(first.last_node_id);

  expect(result).toMatchObject({
    node_id: first.last_node_id,
    status: 'reimported'
  });
  expect(body).toMatchObject({ content: '# Entry\n\nSource body\n', source: 'blob', status: 'resolved' });
  expect(node.deleted_at).toBeNull();
  expect(latestRun).toMatchObject({
    duplicate_semantic: 'updated',
    node_id: first.last_node_id,
    result_status: 'imported'
  });
});

it('does not reimport a topic without an active keep source', async () => {
  const result = await reimportCurrentTopicSource('missing-node');

  expect(result).toMatchObject({
    node_id: null,
    status: 'unavailable'
  });
});
