// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver';
import { closeLibraries, createPeer, joinPeers, startLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { syncRequestLibrary } from '../../electron/database/syncRequestLibrary.testSupport';
import { deleteNodesPermanently, restoreNodes, softDeleteNodes, upsertNodeSnapshot } from '../../lib/core/database/nodeMutations';
import { loadWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { createEmptyWorkspaceActionHistory } from './workspaceActionHistory';
import { collectNodeSubtreeIds } from './workspaceHelpers';
import { prepareWorkspaceNodeChildrenIndex as prepare } from './workspaceNodeChildrenIndex';
import { createInitialWorkspaceState, useWorkspaceStore, type WorkspaceState } from './workspaceStore';
import { createDeleteNodesPermanentlyAction } from './workspaceStorePermanentDeleteAction';
import { withWorkspaceRendererBoundary } from './workspaceStoreRendererBoundary';
import { createRestoreNodeAction } from './workspaceStoreRestoreAction';
import { createDeleteNodesAction } from './workspaceStoreStructureDeleteAction';
import type { TrashRuntimeHandlers } from './workspaceTrashRuntimeCommit';

afterEach(async () => { await closeLibraries(); });
const ids = ['p', 'a', 'b', 'leaf'];
const stamp = '2026-10-28T02:00:00.000Z';

function seed(peer: Peer, id: string, parentNodeId: string | null) {
  upsertNodeSnapshot(peer.driver, { nodeId: id, parentNodeId, kind: 'folder', title: id,
    content: `Saved ${id}`, reveal: null, anchorLink: null, position: null, isTitleManual: true,
    createdAt: stamp, updatedAt: stamp, hostName: peer.name });
  flushNodeSyncVersionWithDriver(peer.driver, id, peer.name, stamp);
}

function harness(peer: Peer) {
  const snapshot = loadWorkspaceSnapshot(peer.driver)!;
  let state: WorkspaceState = { ...useWorkspaceStore.getState(), ...createInitialWorkspaceState(),
    ...snapshot, nodesById: snapshot.nodesById as WorkspaceState['nodesById'],
    appActionHistory: createEmptyWorkspaceActionHistory(), isHydrated: true };
  state = { ...state, ...withWorkspaceRendererBoundary(state, state) };
  prepare(state.nodesById);
  const get = () => state;
  const set = (partial: Partial<WorkspaceState> | ((current: WorkspaceState) => Partial<WorkspaceState>)) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...withWorkspaceRendererBoundary(patch, state) };
  };
  const publish = (nodeIds: string[]) => {
    for (const id of nodeIds) {
      peer.driver.execute('UPDATE nodes SET sync_dirty=1,last_modified_by_host_name=? WHERE id=?', [peer.name, id]);
      flushNodeSyncVersionWithDriver(peer.driver, id, peer.name, new Date().toISOString());
    }
  };
  const handlers: TrashRuntimeHandlers = {
    syncNodeContent: () => { throw new Error('unexpected_whole_node_write'); },
    syncSoftDeleteNodes: payload => {
      softDeleteNodes(peer.driver, payload);
      publish(payload.nodeIds);
      return { deletedNodeIds: payload.nodeIds };
    },
    syncRestoreNodes: payload => {
      const result = restoreNodes(peer.driver, payload);
      publish(result.restoredNodeIds);
      return result;
    },
    syncDeleteNodesPermanently: payload => {
      deleteNodesPermanently(peer.driver, payload);
      return { removedNodeIds: payload.nodeIds };
    }
  };
  return { get, set, remove: createDeleteNodesAction(set, handlers, get),
    restore: createRestoreNodeAction(set, handlers), permanent: createDeleteNodesPermanentlyAction(set, handlers) };
}

function assertSaved(peer: Peer, trashed: boolean, removed = false) {
  const reopened = new Database(peer.file, { readonly: true });
  try {
    const rows = reopened.prepare('SELECT id, content, parent_id, deleted_at FROM nodes ORDER BY id').all() as
      Array<{ id: string; content: string; parent_id: string | null; deleted_at: string | null }>;
    for (const id of ids) {
      const row = rows.find(value => value.id === id);
      if (removed) expect(row).toBeUndefined();
      else {
        expect(row?.content).toBe(`Saved ${id}`);
        expect(Boolean(row?.deleted_at), `${peer.name}:${id}`).toBe(trashed);
        expect(row?.parent_id).toBe(id === 'p' ? null : id === 'leaf' ? 'a' : 'p');
      }
    }
    expect(rows.find(value => value.id === 'unrelated')).toMatchObject({ content: 'Saved unrelated', deleted_at: null });
  } finally { reopened.close(); }
}

it('keeps complete subtree membership through delete, child restore, peer sync, reopen and permanent delete', async () => {
  await startLibraries();
  const local = createPeer('subtree-local');
  const peer = createPeer('subtree-peer');
  joinPeers(local, peer);
  for (const source of [local, peer]) source.db.exec("ATTACH DATABASE ':memory:' AS search");
  for (const [id, parent] of [['p', null], ['a', 'p'], ['b', 'p'], ['leaf', 'a'], ['unrelated', null]] as const) {
    seed(local, id, parent);
  }
  await syncRequestLibrary(local, peer);
  const actions = harness(local);
  const original = actions.get().nodesById;
  const index = prepare(original);
  expect(collectNodeSubtreeIds('p', original)).toEqual(ids);
  await actions.remove(['p']);
  expect(new Set(actions.get().trashedNodeIds)).toEqual(new Set(ids));
  expect(actions.get().appActionHistory.undoStack.at(-1)).toMatchObject({ nodeIds: ids });
  expect(prepare(actions.get().nodesById)).toBe(index);
  await syncRequestLibrary(local, peer);
  for (const source of [local, peer]) assertSaved(source, true);
  const hidden = loadWorkspaceSnapshot(peer.driver)!;
  expect(collectNodeSubtreeIds('p', hidden.nodesById as WorkspaceState['nodesById'])).toEqual(ids);
  expect(await actions.restore('leaf')).toBe('p');
  expect(actions.get().trashedNodeIds).toEqual([]);
  await syncRequestLibrary(local, peer);
  for (const source of [local, peer]) assertSaved(source, false);
  await actions.remove(['p']);
  await actions.permanent(['p']);
  expect(collectNodeSubtreeIds('p', actions.get().nodesById)).toEqual([]);
  expect(collectNodeSubtreeIds('unrelated', actions.get().nodesById)).toEqual(['unrelated']);
  expect(collectNodeSubtreeIds('p', original)).toEqual(ids);
  await syncRequestLibrary(local, peer);
  for (const source of [local, peer]) assertSaved(source, false, true);
});
