// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
  app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
}) }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));

import { handleNodeMutationCommand } from '../ipc/storageNodeMutationCommands.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { replaceNodeOrder, upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceListSnapshot } from './workspaceListSnapshot.js';

let tempRoot = '';
const at = '2026-10-28T08:00:00.000Z';
function node(nodeId: string, parentNodeId: string | null, kind: 'topic' | 'item' | 'folder' = 'topic') {
  return { nodeId, parentNodeId, kind, title: nodeId, isTitleManual: true,
    content: kind === 'folder' ? '' : 'Created body', reveal: kind === 'item' ? 'Answer' : null,
    anchorLink: null, position: null, createdAt: at, updatedAt: at };
}
function children(parentId: string) {
  const row = openDatabaseConnection().sqlite.prepare(
    'SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?'
  ).get(parentId) as { child_ids_json: string };
  return JSON.parse(row.child_ids_json) as string[];
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-create-order-'));
  appDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  for (const input of [node('p', null, 'folder'), node('b', null, 'folder'),
    node('p1', 'p'), node('p2', 'p'), node('b1', 'b'), node('b2', 'b')]) upsertNodeSnapshot(input);
  replaceNodeOrder(['p', 'p2', 'p1', 'b', 'b2', 'b1']);
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it.each(['topic', 'item'] as const)('creates a %s without submitting existing order', (kind) => {
  const sqlite = openDatabaseConnection().sqlite;
  const previous = sqlite.prepare('SELECT * FROM parent_child_order ORDER BY parent_id').all();
  const result = handleNodeMutationCommand(`create_${kind}`, { ...node('new', 'p', kind), activeNodeId: 'new' });
  expect(result).toMatchObject({ createdNodeIds: ['new'], nodes: [{ nodeId: 'new', content: 'Created body' }] });
  expect(result).not.toHaveProperty('nodeOrder');
  expect(children('p')).toEqual(['p2', 'p1', 'new']);
  expect(children('b')).toEqual(['b2', 'b1']);
  expect(sqlite.prepare("SELECT * FROM parent_child_order WHERE parent_id != 'p' ORDER BY parent_id").all())
    .toEqual(previous.filter((row) => (row as { parent_id: string }).parent_id !== 'p'));
  const stored = sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?').get('new') as { current_version_id: string };
  expect(stored.current_version_id).toMatch(/^ver_/);
  const expectedOrder = loadWorkspaceListSnapshot().nodeOrder;
  closeDatabaseConnection();
  expect(loadWorkspaceListSnapshot().nodeOrder).toEqual(expectedOrder);
  expect(children('p')).toEqual(['p2', 'p1', 'new']);
});

it('registers a root folder without changing other root members', () => {
  const before = children('parent-child-order:root');
  const result = handleNodeMutationCommand('create_folder', node('new-folder', null, 'folder'));
  expect(result).toMatchObject({ createdNodeIds: ['new-folder'] });
  expect(children('parent-child-order:root')).toEqual([...before, 'new-folder']);
  expect(children('p')).toEqual(['p2', 'p1']);
});

it('places new Inbox content first while preserving its existing children', () => {
  upsertNodeSnapshot(node('older', 'special-inbox'));
  upsertNodeSnapshot(node('latest', 'special-inbox'));
  const before = children('special-inbox');
  handleNodeMutationCommand('create_topic', node('new', 'special-inbox'));
  expect(children('special-inbox')).toEqual(['new', ...before]);
  expect(children('b')).toEqual(['b2', 'b1']);
});

it('rolls back the node if its parent membership cannot be recorded', () => {
  const sqlite = openDatabaseConnection().sqlite;
  sqlite.exec("CREATE TRIGGER reject_new_order BEFORE INSERT ON parent_order_sources WHEN NEW.parent_id = 'p' BEGIN SELECT RAISE(ABORT, 'reject_order'); END");
  expect(() => handleNodeMutationCommand('create_topic', node('new', 'p'))).toThrow('reject_order');
  expect(sqlite.prepare("SELECT id FROM nodes WHERE id = 'new'").get()).toBeUndefined();
  expect(children('p')).toEqual(['p2', 'p1']);
});

it('retains image references and their version when creating without an order snapshot', () => {
  const key = `${'a'.repeat(64)}.png`;
  handleNodeMutationCommand('create_topic', { ...node('image', 'p'),
    content: `![Image](asset://${key})`, newImageReferences: [
      { storage_key: key, role: 'image', original_name: 'image.png' }
    ] });
  const sqlite = openDatabaseConnection().sqlite;
  const row = sqlite.prepare('SELECT resource_references, current_version_id FROM nodes WHERE id = ?')
    .get('image') as { resource_references: string; current_version_id: string };
  expect(JSON.parse(row.resource_references)).toEqual([
    { storage_key: key, role: 'image', original_name: 'image.png' }
  ]);
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get(row.current_version_id))
    .toEqual({ body_text: `![Image](asset://${key})` });
  expect(children('p')).toEqual(['p2', 'p1', 'image']);
});
