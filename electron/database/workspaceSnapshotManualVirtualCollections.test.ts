// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-snapshot-manual-virtual-collections-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceListSnapshot } from './workspaceListSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-snapshot-manual-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedNode(nodeId: string, position: number) {
  upsertNodeSnapshot({
    anchorLink: null,
    content: `content:${nodeId}`,
    createdAt: '2026-03-06T00:00:00.000Z',
    isTitleManual: true,
    kind: 'topic',
    nodeId,
    parentNodeId: null,
    position,
    reveal: null,
    title: `title:${nodeId}`,
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
}

function seedItemNode() {
  upsertNodeSnapshot({
    anchorLink: null,
    content: 'item',
    createdAt: '2026-03-06T00:00:00.000Z',
    isTitleManual: true,
    kind: 'item',
    nodeId: 'item-not-topic',
    parentNodeId: null,
    position: 3,
    reveal: null,
    title: 'Item',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
}

it('projects manual virtual collections into list snapshots with available material order', () => {
  seedNode('topic-a', 0);
  seedNode('topic-b', 1);
  seedNode('topic-deleted', 2);
  seedItemNode();
  softDeleteNodes({ deletedAt: '2026-03-06T00:20:00.000Z', nodeIds: ['topic-deleted'] });
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO virtual_folders (id, title, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['manual-1', 'Manual Guide', 'Pinned order', '2026-03-06T00:00:00.000Z', '2026-03-06T00:10:00.000Z']
  );
  for (const [id, nodeId, position] of [
    ['item-b', 'topic-b', 10],
    ['item-deleted', 'topic-deleted', 20],
    ['item-a', 'topic-a', 30],
    ['item-non-topic', 'item-not-topic', 40]
  ] as const) {
    driver.execute(
      `INSERT INTO virtual_folder_items (id, folder_id, material_node_id, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, 'manual-1', nodeId, position, '2026-03-06T00:00:00.000Z', '2026-03-06T00:10:00.000Z']
    );
  }

  expect(loadWorkspaceListSnapshot()?.manualVirtualCollections).toEqual([
    {
      availableMaterialNodeIds: ['topic-b', 'topic-a', 'item-not-topic'],
      description: 'Pinned order',
      id: 'manual-1',
      itemCount: 4,
      title: 'Manual Guide',
      updatedAt: '2026-03-06T00:10:00.000Z'
    }
  ]);
});