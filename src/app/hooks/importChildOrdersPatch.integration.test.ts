// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../../../electron/ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../../../electron/database/connection.js';
import { runPreparedImport } from '../../../electron/database/importPipeline.js';
import { initializeDatabase } from '../../../electron/database/migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from '../../../electron/database/nodeMutations.js';
import { loadWorkspaceListSnapshot } from '../../../electron/database/workspaceListSnapshot.js';
import { resolveManagedImportTargetParentNodeId } from '../../../electron/import/importFolderTargets.js';
import { buildImportNodeMutationPatch } from '../../../electron/import/importNodeMutationPatch.js';
import { loadDerivedNodeOrder } from '../../../lib/core/database/parentChildOrder.js';
import type { PreparedImportRecord } from '../../../lib/core/import/contract.js';
import type { NativeTextImportResult } from '../../../lib/platform/nativeContract.js';
import { selectTrashRootIds } from '../../features/nodes/model/trashRootModel';
import type { WorkspaceNodeMutationPatchResult } from '../../shared/platform/workspaceRuntimeTypes';
import { createWorkspaceNodeMutationPatch } from '../../store/workspaceNodeMutationPatch';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { WorkspaceState } from '../../store/workspaceStoreTypes';

import { applyImportWorkspacePatch, resetAppliedImportWorkspacePatches } from './formalImportWorkspacePatch';

let tempRoot = '';
beforeEach(async () => {
  resetAppliedImportWorkspacePatches();
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-child-orders-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  await initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function importFile(name: string, importedAt: string, extra: Partial<PreparedImportRecord> = {}): NativeTextImportResult {
  const imported = runPreparedImport({
    content: `${name} body Alpha`, contentFingerprint: `${name}-content-${importedAt}`, degradedReason: null,
    hideTitleHeading: false, importedAt, nodeTitle: name, provider: 'desktop_text_file',
    sourceFingerprint: `${name}-source-${importedAt}`, sourceKind: 'markdown', sourceLocator: `/tmp/${name}-${importedAt}.md`,
    sourceName: `${name}.md`, sourceTrackingMode: 'untracked', ...extra
  });
  return {
    content_fingerprint: imported.contentFingerprint, degraded_reason: imported.degradedReason,
    duplicate_semantic: imported.duplicateSemantic, failure_reason: imported.failureReason, import_id: imported.importId,
    imported_at: imported.importedAt, node_id: imported.nodeId, provider: imported.provider,
    result_status: imported.resultStatus, source_fingerprint: imported.sourceFingerprint, source_kind: imported.sourceKind,
    source_locator: imported.sourceLocator, source_name: imported.sourceName
  };
}

const at = (minute: number) => `2099-01-01T10:${String(minute).padStart(2, '0')}:00.000Z`;

/** A library whose Inbox is gone, so the next import creates it again. */
function removeInbox() {
  openDatabaseConnection().driver.execute("DELETE FROM nodes WHERE id = 'special-inbox'", []);
}

function seed(nodeId: string, parentNodeId: string | null, position: number, kind: 'folder' | 'topic' = 'topic') {
  upsertNodeSnapshot({
    anchorLink: null, content: kind === 'folder' ? '' : `# ${nodeId}`, createdAt: `2026-01-01T00:00:${String(position % 60).padStart(2, '0')}.000Z`,
    isTitleManual: true, kind, nodeId, parentNodeId, position, reveal: null, title: nodeId,
    updatedAt: '2026-01-01T00:00:00.000Z'
  });
}

/** Unrelated library material: folders with children that no import touches. */
function seedUnrelated(count: number) {
  const ids: string[] = [];
  for (let folder = 0; folder < count; folder += 1) {
    seed(`unrelated-${folder}`, null, folder, 'folder');
    ids.push(`unrelated-${folder}`);
    for (let child = 0; child < 3; child += 1) {
      seed(`unrelated-${folder}-${child}`, `unrelated-${folder}`, child);
      ids.push(`unrelated-${folder}-${child}`);
    }
  }
  return new Set(ids);
}

function loadOpenedWorkspace() {
  const snapshot = loadWorkspaceListSnapshot();
  useWorkspaceStore.setState({
    activeNodeId: null,
    nodeOrder: snapshot.nodeOrder,
    nodesById: snapshot.nodesById as unknown as WorkspaceState['nodesById'],
    trashedNodeIds: snapshot.trashedNodeIds
  });
  return useWorkspaceStore.getState();
}

/** The launch list also shows Home, which is not a stored node; orders are compared over stored nodes. */
function storedIds() {
  return new Set(openDatabaseConnection().driver.queryAll<{ id: string }>('SELECT id FROM nodes').map((row) => row.id));
}

function visibleOrder(state: Pick<WorkspaceState, 'nodeOrder' | 'nodesById' | 'trashedNodeIds'>) {
  const trashed = new Set(state.trashedNodeIds);
  const isVisible = (id: string): boolean => {
    const node = state.nodesById[id];
    if (!node || trashed.has(id)) return false;
    return node.parentNodeId === null || isVisible(node.parentNodeId);
  };
  const stored = storedIds();
  return state.nodeOrder.filter((id) => stored.has(id) && isVisible(id));
}

/** What a fresh launch shows: the whole derived order, without Trash and without anything under it. */
function freshVisibleOrder() {
  const driver = openDatabaseConnection().driver;
  const rows = new Map(driver.queryAll<{ id: string; parent_id: string | null; deleted_at: string | null }>(
    'SELECT id, parent_id, deleted_at FROM nodes').map((row) => [row.id, row]));
  const isVisible = (id: string): boolean => {
    const row = rows.get(id);
    return Boolean(row && !row.deleted_at && (row.parent_id === null || isVisible(row.parent_id)));
  };
  return loadDerivedNodeOrder(driver).filter(isVisible);
}

function applyAndCompare(before: WorkspaceState, patch: WorkspaceNodeMutationPatchResult, importId: string, unrelated: Set<string>) {
  expect(patch.nodeOrder).toBeUndefined();
  // Unrelated material never travels; only a newly created root folder brings the root's own children.
  const rootCreated = patch.childOrders?.some((order) => order.parentNodeId === null) ?? false;
  expect(patch.childOrders?.flatMap((order) => order.childIds)
    .filter((id) => unrelated.has(id) && (!rootCreated || id.split('-').length > 2))).toEqual([]);
  // The previous patch: the same nodes with the library-wide order.
  const nodesOnly: WorkspaceNodeMutationPatchResult = { ...patch };
  delete nodesOnly.childOrders;
  const nodeOrder = loadDerivedNodeOrder(openDatabaseConnection().driver);
  const full = { ...before, ...createWorkspaceNodeMutationPatch(before, { ...nodesOnly, nodeOrder }) };
  expect(applyImportWorkspacePatch(importId, patch)).toBe(true);
  const partial = useWorkspaceStore.getState();
  expect(visibleOrder(partial)).toEqual(visibleOrder(full));
  expect(visibleOrder(partial)).toEqual(freshVisibleOrder());
  expect(selectTrashRootIds(partial.nodeOrder, partial.nodesById, partial.trashedNodeIds))
    .toEqual(selectTrashRootIds(before.nodeOrder, before.nodesById, before.trashedNodeIds));
  return partial;
}

it('places a first import and the Inbox it creates without the library-wide order', () => {
  const unrelated = seedUnrelated(6);
  removeInbox();
  const before = loadOpenedWorkspace();
  const result = importFile('First', at(10), {
    matchedHighlights: [{ content: 'Alpha', label: null, locatorText: 'Alpha' }]
  });
  const patch = buildImportNodeMutationPatch([result])!;
  expect(patch.nodes.map((node) => node.nodeId)).toEqual(expect.arrayContaining([result.node_id, 'special-inbox']));
  expect(patch.nodes.length).toBeGreaterThan(2);
  const after = applyAndCompare(before, patch, result.import_id, unrelated);
  expect(visibleOrder(after)).toContain('special-inbox');
});

it('keeps a Trash sibling out of the Inbox order and the Trash list order unchanged', () => {
  const unrelated = seedUnrelated(4);
  importFile('Existing', at(0));
  seed('inbox-kept', 'special-inbox', 1);
  seed('inbox-trashed', 'special-inbox', 2);
  seed('other-trashed', 'unrelated-1', 9);
  softDeleteNodes({ deletedAt: at(5), nodeIds: ['other-trashed'] });
  softDeleteNodes({ deletedAt: at(6), nodeIds: ['inbox-trashed'] });
  const before = loadOpenedWorkspace();
  const result = importFile('Later', at(10));
  const patch = buildImportNodeMutationPatch([result])!;
  expect(patch.childOrders?.find((order) => order.parentNodeId === 'special-inbox')?.childIds).not.toContain('inbox-trashed');
  applyAndCompare(before, patch, result.import_id, unrelated);
});

it('orders a batch of same-titled imports made at the same time', () => {
  const unrelated = seedUnrelated(4);
  importFile('Seed', at(0));
  const before = loadOpenedWorkspace();
  const sameTime = at(10);
  const results = [importFile('Same', sameTime), importFile('Same', sameTime), importFile('Other', sameTime)];
  const patch = buildImportNodeMutationPatch(results)!;
  applyAndCompare(before, patch, results[2]!.import_id, unrelated);
});

it('brings the parent folders an import creates and places them under their own parents', () => {
  const unrelated = seedUnrelated(4);
  removeInbox();
  const before = loadOpenedWorkspace();
  const importedAt = at(10);
  const importRootPath = path.join(tempRoot, 'import-root');
  const targetParentNodeId = resolveManagedImportTargetParentNodeId({
    filePath: path.join(importRootPath, 'Inbox', 'Books', 'Deep', 'a.md'), importedAt, importRootPath
  })!;
  const results = [importFile('Nested', importedAt, { targetParentNodeId }), importFile('Nested sibling', importedAt, { targetParentNodeId })];
  const patch = buildImportNodeMutationPatch(results)!;
  const after = applyAndCompare(before, patch, results[1]!.import_id, unrelated);
  expect(visibleOrder(after)).toEqual(expect.arrayContaining(['special-inbox', targetParentNodeId]));
});

it('reloads instead of applying child orders that name a node the workspace lacks', () => {
  seedUnrelated(2);
  loadOpenedWorkspace();
  const importedAt = at(10);
  const importRootPath = path.join(tempRoot, 'import-root');
  const folderId = resolveManagedImportTargetParentNodeId({
    filePath: path.join(importRootPath, 'Inbox', 'Books', 'a.md'), importedAt, importRootPath
  })!;
  const result = importFile('First', importedAt, { targetParentNodeId: folderId });
  const patch = buildImportNodeMutationPatch([result])!;
  expect(patch.nodes.map((node) => node.nodeId)).toContain(folderId);
  const withoutFolder = { ...patch, nodes: patch.nodes.filter((node) => node.nodeId !== folderId) };
  const before = useWorkspaceStore.getState();
  expect(applyImportWorkspacePatch(result.import_id, withoutFolder)).toBe(false);
  expect(useWorkspaceStore.getState()).toBe(before);
});
