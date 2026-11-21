// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
  app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
}) }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../foliolePublish/foliolePublishManagement.js', () => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));

import { parseNodeResourceReferences } from '../../lib/core/database/nodeResourceReferences.js';
import { readParentChildOrder } from '../../lib/core/database/parentChildOrder.js';
import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording.js';
import { collectArticleImageStorageKeys } from '../../lib/core/import/replaceArticleImageSource.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
import { handleNodeMutationCommand } from '../ipc/storageNodeMutationCommands.js';
import { handleReadingAndReviewCommand } from '../ipc/storageReadCommands.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { drainDirtyNodeSyncVersions } from './nodeSyncVersionDrain.js';
import { createAttachmentCleanupPlan } from './orphanAttachmentCleanup.js';

// Work-amplification check: everyday single-node writes on the desktop, counted in rows read, never durations.
const at = '2026-11-21T08:00:00.000Z';
const later = '2026-11-21T09:00:00.000Z';
const shared = `${'a'.repeat(64)}.png`;
const own = `${'b'.repeat(64)}.png`;
let tempRoot = '';

/** `folders` root folders, each with four topics of four items; a fixed few nodes hold attachments. */
async function openLibrary(folders: number) {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-desktop-wa-'));
  appDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  const { sqlite } = openDatabaseConnection();
  const insert = sqlite.prepare(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const setContent = sqlite.prepare('UPDATE nodes SET content = ? WHERE id = ?');
  sqlite.transaction(() => {
    for (let f = 0; f < folders; f += 1) {
      insert.run(`f${f}`, null, 'folder', `f${f}`, '', at, at);
      for (let t = 0; t < 4; t += 1) {
        insert.run(`f${f}t${t}`, `f${f}`, 'topic', `f${f}t${t}`, 'Body', at, at);
        for (let i = 0; i < 4; i += 1) insert.run(`f${f}t${t}i${i}`, `f${f}t${t}`, 'item', 'q', 'Body', at, at);
      }
    }
    setContent.run(`![](${buildAssetMarkdownUrl(shared)})`, 'f1t0i0');
    setContent.run(`![](${buildAssetMarkdownUrl(own)})`, 'f1t0i1');
    // The shared image again, percent-encoded, and the other one as a reference attachment elsewhere.
    setContent.run(`![](asset://%61${shared.slice(1)})`, 'f0t0');
    sqlite.prepare('UPDATE nodes SET resource_references = ? WHERE id = ?')
      .run(JSON.stringify([{ storage_key: own, role: 'reference', original_name: null }]), 'f0t1');
  })();
  // A settled library: every node already has its sync version, as after normal use.
  await drainDirtyNodeSyncVersions();
}

async function closeLibrary() {
  await drainDirtyNodeSyncVersions();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
}

let open = false;
afterEach(async () => { if (open) await closeLibrary(); open = false; });

const reading = { intervalDurationMs: 86_400_000, intervalGrowthFactor: 2, lastHandledAt: later,
  nextAt: '2026-11-22T09:00:00.000Z', priority: 5, readingPosition: 0, repetitionCount: 1, state: 'dismissed' as const };
const subtree = ['f1t0', 'f1t0i0', 'f1t0i1', 'f1t0i2', 'f1t0i3'];
const children = (parentId: string) => readParentChildOrder(openDatabaseConnection().driver, parentId).childIds;
const trash = () => handleNodeMutationCommand('soft_delete_nodes', { nodeIds: subtree, deletedAt: at });

/** Each write runs after `setup`, which is not counted. */
const writes: Record<string, { setup?: () => unknown; write: () => unknown }> = {
  'move to Trash': { write: trash },
  'move to Trash and settle its sync versions': { write: async () => { trash(); await drainDirtyNodeSyncVersions(); } },
  'restore from Trash': { setup: trash, write: () => handleNodeMutationCommand('restore_nodes', { nodeIds: subtree }) },
  'delete permanently': { setup: trash, write: () => handleNodeMutationCommand('delete_nodes_permanently', { nodeIds: subtree }) },
  'move to another folder': { write: () => {
    const source = children('f1');
    const target = children('f2');
    return handleNodeMutationCommand('move_nodes', { nodes: [{ nodeId: 'f1t0', expectedParentNodeId: 'f1',
      parentNodeId: 'f2', updatedAt: later }], parentOrders: [
      { parentNodeId: 'f1', expectedChildIds: source, childIds: source.filter(id => id !== 'f1t0') },
      { parentNodeId: 'f2', expectedChildIds: target, childIds: ['f1t0', ...target] }],
    maintainSequentialReading: false, defaultPriority: 5 });
  } },
  'reorder within its folder': { write: () => {
    const source = children('f1');
    return handleNodeMutationCommand('move_nodes', { nodes: [{ nodeId: 'f1t3', expectedParentNodeId: 'f1',
      parentNodeId: 'f1', updatedAt: later }], parentOrders: [
      { parentNodeId: 'f1', expectedChildIds: source, childIds: ['f1t3', ...source.filter(id => id !== 'f1t3')] }],
    maintainSequentialReading: false, defaultPriority: 5 });
  } },
  rename: { write: () => handleNodeMutationCommand('update_node_content', { nodeId: 'f1t0', parentNodeId: 'f1', kind: 'topic',
    title: 'Renamed', isTitleManual: true, content: 'Body', reveal: null, anchorLink: null, position: null,
    createdAt: at, updatedAt: later }) },
  'mark as read': { write: () => handleReadingAndReviewCommand('save_node_reading_state', { nodeId: 'f1t0', reading, updatedAt: later }) },
  'save reading progress': { write: () => handleReadingAndReviewCommand('save_reading_progress', { activeNodeId: 'f1t0',
    nodeViewStates: [{ nodeId: 'f1t0', scrollTop: 120, readingOffset: 10, selectionFrom: null, selectionTo: null }],
    // Later than anything the library opened with, so the write is never skipped as stale.
    source: 'reader', updatedAt: '2099-01-01T00:00:00.000Z' }) }
};

async function rowsRead(folders: number, name: string) {
  await openLibrary(folders);
  try {
    const { setup, write } = writes[name]!;
    await setup?.();
    sqlRecording.start({ label: name, maxGroups: 2000 });
    try { await write(); }
    finally { sqlRecording.stop(); }
    return sqlRecording.snapshot()!.groups.reduce((total, group) => total + group.returnedRows, 0);
  } finally { await closeLibrary(); }
}

it.each(Object.keys(writes))('reads the same number of rows to %s however large the library is', async (name) => {
  expect(await rowsRead(100, name)).toBe(await rowsRead(25, name));
});

/** The plan that reading every node gives, as the cleanup did before it was scoped. */
function completePlan(nodeIds: string[]) {
  const rows = openDatabaseConnection().driver.queryAll<{ id: string; content: string; resource_references: string }>(
    'SELECT id, content, resource_references FROM nodes');
  const keys = (selected: typeof rows) => [...new Set(selected.flatMap(row => [...collectArticleImageStorageKeys(row.content),
    ...parseNodeResourceReferences(row.resource_references).filter(ref => ref.role === 'reference').map(ref => ref.storage_key)]))].sort();
  const removed = new Set(nodeIds);
  return { candidates: keys(rows.filter(row => removed.has(row.id))), retainedKeys: keys(rows.filter(row => !removed.has(row.id))) };
}

it('plans the same attachment cleanup from the narrow read as from every node', async () => {
  await openLibrary(25);
  open = true;
  expect(completePlan(subtree)).toEqual({ candidates: [shared, own], retainedKeys: [shared, own] });
  for (const nodeIds of [subtree, ['f1t0i1'], ['f0t0', 'f0t1'], ['f2t0', 'f2t0i0']]) {
    const plan = createAttachmentCleanupPlan(nodeIds);
    const complete = completePlan(nodeIds);
    expect(plan.candidates.map(row => `${row.id}.png`)).toEqual(complete.candidates);
    // Retained keys only decide the fate of candidates; with none, the rest of the library is not read.
    expect([...plan.retainedKeys].sort()).toEqual(complete.candidates.length ? complete.retainedKeys : []);
  }
});
