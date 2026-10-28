// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let tempRoot = '';
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: tempRoot, app_cache_dir: path.join(tempRoot, 'cache'),
  app_config_dir: path.join(tempRoot, 'config'), app_log_dir: path.join(tempRoot, 'logs')
}) }));

import { loadWorkspaceListProjection } from '../../lib/core/database/workspaceListProjection.js';
import { loadWorkspaceListSnapshot as loadSharedList } from '../../lib/core/database/workspaceListSnapshot.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { currentLibraryScope } from '../database/attachmentResourceDescription.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { resetSeededWorkspace } from '../database/databaseTestWorkspace.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { drainDirtyNodeSyncVersions } from '../database/nodeSyncVersionDrain.js';
import { restoreNodesWithParents, softDeleteNodesWithParents } from '../database/nodeTrashTransitions.js';
import { projectWorkspaceListRendererNode } from '../database/workspaceListRendererNodes.js';
import { loadWorkspaceListSnapshot } from '../database/workspaceListSnapshot.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { handleWorkspaceReadCommand } from './storageReadCommands.js';

const timestamp = '2026-10-28T00:00:00.000Z';
const references = [
  { storage_key: `${'a'.repeat(64)}.png`, original_name: 'Image.png', role: 'image' },
  { storage_key: `${'b'.repeat(64)}.pdf`, original_name: 'Document.pdf', role: 'reference' }
];

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-list-resources-'));
  initializeDatabase();
  resetSeededWorkspace();
  for (const nodeId of ['linked', 'unlinked']) {
    upsertNodeSnapshot({ nodeId, parentNodeId: null, kind: 'topic', title: nodeId,
      isTitleManual: true, content: 'Preserved local body', reveal: null, anchorLink: null,
      position: 0, createdAt: timestamp, updatedAt: timestamp });
  }
  openDatabaseConnection().driver.execute('UPDATE nodes SET resource_references = ? WHERE id = ?',
    [JSON.stringify(references), 'linked']);
});
afterEach(async () => {
  await drainDirtyNodeSyncVersions();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function readDesktop(mode: 'full' | 'scoped') {
  return handleWorkspaceReadCommand(mode === 'full'
    ? NATIVE_COMMANDS.loadWorkspaceListSnapshot : NATIVE_COMMANDS.loadWorkspaceListProjection,
  mode === 'full' ? {} : { nodeIds: ['linked', 'unlinked'], structure: false,
    libraryScope: currentLibraryScope() }) as ReturnType<typeof loadWorkspaceListSnapshot>;
}

it.each(['full', 'scoped'] as const)('omits resource references from the %s desktop list while preserving shared facts', mode => {
  const driver = openDatabaseConnection().driver;
  const shared = mode === 'full' ? loadSharedList(driver)!
    : loadWorkspaceListProjection(driver, { nodeIds: ['linked', 'unlinked'], structure: false });
  const desktop = readDesktop(mode);
  expect(shared.nodesById.linked?.resourceReferences).toEqual(references);
  expect(shared.nodesById.unlinked?.resourceReferences).toEqual([]);
  for (const id of ['linked', 'unlinked']) {
    const expected = { ...shared.nodesById[id]! };
    delete expected.importContentFingerprint;
    delete expected.importSourceFingerprint;
    delete expected.readwiseRemoteLifecycle;
    delete expected.resourceReferences;
    expect(desktop.nodesById[id]).toEqual(expected);
    expect(desktop.nodesById[id]).not.toHaveProperty('resourceReferences');
  }
});

it('preserves raw resources, full snapshots and attachment descriptions after desktop reads and reopen', () => {
  const { driver } = openDatabaseConnection();
  const before = driver.queryAll('SELECT resource_references FROM nodes ORDER BY id');
  readDesktop('full');
  readDesktop('scoped');
  for (const includeBody of [false, true]) {
    const full = loadWorkspaceSnapshot({ includeBody })!.nodesById.linked!;
    expect(full.resourceReferences).toEqual(references);
    expect(full.attachments?.map(item => [item.storageKey, item.mimeType, item.originalName, item.role]))
      .toEqual(references.map(item => [item.storage_key, item.role === 'image' ? 'image/png' : 'application/pdf', item.original_name, item.role]));
    const node = { ...loadSharedList(driver)!.nodesById.linked!, attachments: full.attachments! };
    expect(projectWorkspaceListRendererNode(node, 'fixture').attachments)
      .toEqual(full.attachments!.map(item => ({ ...item, libraryScope: 'fixture' })));
  }
  closeDatabaseConnection();
  expect(readDesktop('full').nodesById.linked?.title).toBe('linked');
  expect(loadWorkspaceSnapshot()?.nodesById.linked?.resourceReferences).toEqual(references);
  expect(openDatabaseConnection().driver.queryAll('SELECT resource_references FROM nodes ORDER BY id')).toEqual(before);
});


it('keeps mounted image and PDF references through desktop reads, delete, restore and reopen', () => {
  readDesktop('full');
  softDeleteNodesWithParents({ nodeIds: ['linked'], deletedAt: timestamp });
  expect(readDesktop('full').trashedNodeIds).toContain('linked');
  expect(loadWorkspaceSnapshot()?.nodesById.linked?.resourceReferences).toEqual(references);
  expect(restoreNodesWithParents({ nodeIds: ['linked'] }).restoredNodeIds).toEqual(['linked']);
  closeDatabaseConnection();
  const restored = readDesktop('full');
  expect(restored.nodeOrder).toContain('linked');
  expect(restored.trashedNodeIds).not.toContain('linked');
  expect(readDesktop('scoped').nodesById.linked).not.toHaveProperty('resourceReferences');
  expect(loadWorkspaceSnapshot()?.nodesById.linked?.resourceReferences).toEqual(references);
});
