// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';


let tempRoot = '';
vi.mock('../../electron/ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: tempRoot, app_cache_dir: path.join(tempRoot, 'cache'),
    app_config_dir: path.join(tempRoot, 'config'), app_log_dir: path.join(tempRoot, 'logs')
  })
}));

import { closeDatabaseConnection } from '../../electron/database/connection.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import { moveNodes, upsertNodeSnapshot } from '../../electron/database/nodeMutations.js';
import { loadWorkspaceSnapshot } from '../../electron/database/workspaceSnapshot.js';

import { buildSequentialReadingMaintenancePatch } from './workspaceSequentialReadingMaintenance';
import { maintenanceTree } from './workspaceSequentialReadingMaintenance.testSupport';

afterEach(async () => {
  closeDatabaseConnection();
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

it('persists every unlocked descendant through the production move and database reopen', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-reading-batch-move-'));
  initializeDatabase();
  const args = maintenanceTree();
  for (const [position, node] of Object.values(args.previousNodesById).entries()) {
    upsertNodeSnapshot({
      nodeId: node.id, parentNodeId: node.parentNodeId, kind: node.kind, title: node.title,
      isTitleManual: true, content: node.content, reveal: null, anchorLink: null, position,
      reading: node.reading ?? null, sequentialReadingEnabled: node.sequentialReadingEnabled ?? null,
      createdAt: node.createdAt, updatedAt: node.updatedAt
    });
  }
  const patch = buildSequentialReadingMaintenancePatch(args)!;
  moveNodes({
    nodeOrder: args.nodeOrder,
    nodes: ['moved', ...patch.changes.map((change) => change.nodeId)].map((id) => {
      const node = patch.nodesById[id]!;
      return { nodeId: id, parentNodeId: node.parentNodeId, reading: node.reading ?? null,
        sequentialReadingEnabled: node.sequentialReadingEnabled ?? null, updatedAt: args.now };
    })
  });
  closeDatabaseConnection();
  initializeDatabase();
  const snapshot = loadWorkspaceSnapshot()!;
  expect(snapshot.nodesById.moved?.parentNodeId).toBe('destination');
  for (const change of patch.changes) {
    expect(snapshot.nodesById[change.nodeId]?.reading).toEqual(change.afterReading);
  }
  expect(snapshot.nodesById.source?.sequentialReadingEnabled).toBe(true);
});
