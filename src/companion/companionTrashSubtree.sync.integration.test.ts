// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import type { DbPort } from '../../lib/core/sync/dbPort';
import { loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';
import { applyCompanionLocalNodeVersions } from '../shared/platform/companionSyncObjects';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';
import { createCompanionRequestFixture, native } from '../test/companionRequestSync.testSupport';

import { toCompanionNativeNodeVersion } from './companionAnnotationNodeVersion';
import { restoreCompanionTrashNode } from './companionTrashActions';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true }, registerPlugin: vi.fn(() => ({}))
}));
vi.mock('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', async () => {
  const { CompanionNodePriorityState } = await import('../shared/platform/companion/runtime/companionNodePriorityState');
  const priorities = new CompanionNodePriorityState();
  const owner = {
    databasePath: '/fixture',
    get nodePriorityRevision() { return priorities.revision; },
    readNodePriorities: priorities.read.bind(priorities),
    readNodeIndex: priorities.readIndex.bind(priorities),
    readNodeOrder: priorities.readOrder.bind(priorities),
    readNodeMetadata: priorities.readMetadata.bind(priorities),
    refreshNodePriorities: (scope: Parameters<typeof priorities.refresh>[1], db = native.db!) => priorities.refresh(db, scope),
    clearNodePriorities: () => priorities.clear(),
    read: (task: (db: DbPort) => unknown) => task(native.db!),
    readSnapshot: (task: (db: DbPort) => unknown) => task(native.db!),
    runWriter: (task: (db: DbPort) => unknown) => task(native.db!)
  };
  return { getIosCompanionDatabaseOwner: () => owner };
});

type Host = Awaited<ReturnType<typeof createCompanionRequestFixture>>;
const ids = ['restore-root', 'restore-a', 'restore-deep', 'restore-b'];
const shapes = [['restore-root', null, 'folder'], ['restore-a', 'restore-root', 'folder'],
  ['restore-b', 'restore-root', 'topic'], ['restore-deep', 'restore-a', 'topic'],
  ['restore-outside', null, 'topic']] as const;

async function seed(host: Host) {
  for (const [id, parentNodeId, kind] of shapes) {
    const node: WorkspaceNodeSnapshot = { id, parentNodeId, kind, title: id, content: `Complete body ${id}`,
      currentVersionId: null, deletedAt: '2026-10-01', createdAt: '2026-09-01', updatedAt: '2026-10-01',
      anchorLink: null, isTitleManual: false, hideTitleHeading: false, reveal: null, reading: null, review: null };
    await applyCompanionLocalNodeVersions([await toCompanionNativeNodeVersion(node, 'Mobile', `base-${id}`)]);
  }
  const source = (await loadIosCompanionWorkspaceSnapshot(host.db))!;
  return { ...source, nodesById: Object.fromEntries(shapes.map(([id]) => [id, source.nodesById[id]!])) };
}

function facts(db: Database.Database) {
  return shapes.map(([id]) => db.prepare('SELECT id, parent_id, content, deleted_at FROM nodes WHERE id = ?').get(id));
}

async function restore(host: Host, snapshot: WorkspaceSnapshot) {
  const result = await restoreCompanionTrashNode({ deviceId: 'Mobile', nodeId: 'restore-root', snapshot });
  expect(result?.snapshot.trashedNodeIds).toEqual(['restore-outside']);
  const entry = (await loadCompanionFlowHistory(companionFlowHistoryKey('Mobile'))).undoStack.at(-1);
  expect(entry).toMatchObject({ type: 'nodes.change', rootNodeId: 'restore-root', subtreeNodeIds: ids });
  return result!;
}

it('restores a multilevel subtree, replays it atomically, and synchronizes both reopened libraries', { meta: { calibratedMs: 20000 } }, async () => {
  const host = await createCompanionRequestFixture();
  let peer = new Database(host.fixture.rightSnapshot.databasePath, { readonly: true });
  try {
    const source = await seed(host);
    await host.sync();
    expect(facts(peer)).toEqual(facts(host.sqlite));
    await restore(host, source);
    const restored = facts(host.sqlite);
    expect(restored).toEqual(shapes.map(([id, parent_id]) => ({ id, parent_id,
      content: `Complete body ${id}`, deleted_at: id === 'restore-outside' ? '2026-10-01' : null })));
    const historyKey = companionFlowHistoryKey('Mobile');
    await replayCompanionFlowHistory(historyKey, 'undo', createEmptyReviewSession());
    expect(facts(host.sqlite).every(row => (row as { deleted_at: string | null }).deleted_at !== null)).toBe(true);
    await host.sync();
    expect(facts(peer)).toEqual(facts(host.sqlite));
    await replayCompanionFlowHistory(historyKey, 'redo', createEmptyReviewSession());
    expect(facts(host.sqlite)).toEqual(restored);
    await host.sync(); await host.sync();
    await host.restart();
    peer.close(); peer = new Database(host.fixture.rightSnapshot.databasePath, { readonly: true });
    expect(facts(host.sqlite)).toEqual(restored);
    expect(facts(peer)).toEqual(restored);
    const reloaded = await loadIosCompanionWorkspaceSnapshot(host.db);
    expect(reloaded?.trashedNodeIds).toContain('restore-outside');
    for (const id of ids) expect(reloaded?.trashedNodeIds).not.toContain(id);
  } finally { peer.close(); await host.close(); }
});

it('rejects one advanced descendant before writing any restored node', { meta: { calibratedMs: 20000 } }, async () => {
  const host = await createCompanionRequestFixture();
  try {
    const source = await seed(host);
    const advanced = { ...source.nodesById['restore-deep']!, title: 'Newer title', updatedAt: '2026-10-02' };
    await applyCompanionLocalNodeVersions([await toCompanionNativeNodeVersion(advanced, 'Mobile', 'advanced-deep')]);
    const before = facts(host.sqlite);
    const versions = host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
    await expect(restoreCompanionTrashNode({ deviceId: 'Mobile', nodeId: 'restore-root', snapshot: source }))
      .rejects.toThrow('local_restore_not_applied');
    expect(facts(host.sqlite)).toEqual(before);
    expect(host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(versions);
  } finally { await host.close(); }
});
