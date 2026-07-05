// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-incoming-update-actions-tests';

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
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { importPendingIncomingUpdateAsNewTopic } from './incomingUpdateActions.js';
import { upsertPendingIncomingUpdate } from './incomingUpdates.js';
import { loadNodeSourceUpdatePreview } from './nodeSourceUpdatePreview.js';
import { seedMirrorTopic } from './nodeSourceUpdatePreview.testSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-incoming-update-actions-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('imports mismatched pending incoming updates as a new suffixed topic', async () => {
  seedMirrorTopic({ id: 'topic-incoming-new', relativePath: 'Projects/New.md' });
  upsertNodeSnapshot({
    anchorLink: null,
    content: 'Existing content',
    createdAt: '2026-03-28T04:00:00.000Z',
    isTitleManual: true,
    kind: 'topic',
    nodeId: 'existing-imported-topic',
    parentNodeId: null,
    position: null,
    priority: null,
    reveal: null,
    title: 'Imported topic',
    updatedAt: '2026-03-28T04:00:00.000Z'
  });
  const incomingUpdateId = upsertPendingIncomingUpdate({
    importedAt: '2026-03-28T05:00:00.000Z',
    sourcePath: 'Projects/New.md',
    topicId: 'topic-incoming-new',
    updatedContent: '# Imported topic\n\nIncoming import content'
  });

  const result = importPendingIncomingUpdateAsNewTopic(incomingUpdateId);

  expect(result).toMatchObject({ incoming_update_id: incomingUpdateId, status: 'imported_as_new' });
  expect(result.node_id).toEqual(expect.any(String));
  expect(openDatabaseConnection().driver.queryOne<{ content: string; title: string }>(
    `SELECT content, title FROM nodes WHERE id = ?`,
    [result.node_id as string]
  )).toEqual({ content: '# Imported topic\n\nIncoming import content', title: 'Imported topic 2' });
  expect(openDatabaseConnection().driver.queryOne<{ content: string }>(
    `SELECT content FROM nodes WHERE id = ?`,
    ['topic-incoming-new']
  )?.content).toBe('Current mirror content');
  await expect(loadNodeSourceUpdatePreview('topic-incoming-new')).resolves.toBeNull();
});
