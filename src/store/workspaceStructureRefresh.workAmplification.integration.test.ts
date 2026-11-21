// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { closeLibraries, createPeer, startLibraries } from '../../electron/database/syncLibrary.testSupport.js';
import { saveLocalCurrentParentOrder } from '../../lib/core/database/currentParentOrderStore.js';
import { ROOT_CHILD_ORDER_ID } from '../../lib/core/database/parentChildOrder.js';
import { loadWorkspaceListProjection } from '../../lib/core/database/workspaceListProjection.js';
import { loadWorkspaceListSnapshot } from '../../lib/core/database/workspaceListSnapshot.js';

import { createInitialWorkspaceState } from './workspaceStore.js';
import type { WorkspaceState } from './workspaceStoreTypes.js';
import { mergeWorkspaceSyncProjection } from './workspaceSyncProjectionMerge.js';
import { listKnownStructureNodeIds } from './workspaceSyncProjectionRefresh.js';

// Work-amplification check: a structural refresh after a committed change elsewhere (a synced device or
// another window) reads rows in proportion to the change, not the library. Counts only, never durations.
beforeEach(startLibraries);
afterEach(closeLibraries);

const at = '2026-11-21T08:00:00.000Z';
type Peer = ReturnType<typeof createPeer>;

/** Folder `work` holds the changes; folder `archive` grows with `archiveFolders`. */
function openLibrary(archiveFolders: number) {
  const peer = createPeer(`peer-${archiveFolders}`);
  const insert = (id: string, parent: string | null, kind: string, createdAt = at) => peer.driver.execute(
    'INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, parent, kind, id, kind === 'folder' ? '' : 'Body', createdAt, createdAt]);
  peer.driver.transaction(() => {
    insert('work', null, 'folder');
    insert('archive', null, 'folder');
    for (const id of ['t0', 't1', 't2']) insert(id, 'work', 'topic');
    insert('sub', 'work', 'folder');
    for (const id of ['s0', 's1']) insert(id, 'sub', 'topic');
    insert('s0x', 's0', 'item');
    insert('t2x', 't2', 'item');
    for (let f = 0; f < archiveFolders; f += 1) {
      insert(`a${f}`, 'archive', 'folder');
      for (let t = 0; t < 4; t += 1) {
        insert(`a${f}t${t}`, `a${f}`, 'topic');
        for (let i = 0; i < 4; i += 1) insert(`a${f}t${t}i${i}`, `a${f}t${t}`, 'item');
      }
    }
  });
  return peer;
}

const later = (minute: number) => `2026-11-21T09:${String(minute).padStart(2, '0')}:00.000Z`;
/** Committed changes as a synced device or another window leaves them, with the scope they announce. */
const changes: Array<[name: string, apply: (peer: Peer) => string[]]> = [
  ['move a topic into a subfolder', peer => {
    peer.driver.execute('UPDATE nodes SET parent_id = ?, updated_at = ? WHERE id = ?', ['sub', later(1), 't1']);
    return ['t1'];
  }],
  ['move a subfolder to Trash', peer => {
    for (const id of ['sub', 's0', 's1', 's0x']) peer.driver.execute('UPDATE nodes SET deleted_at = ?, updated_at = ? WHERE id = ?', [later(2), later(2), id]);
    return ['sub', 's0', 's1', 's0x'];
  }],
  ['restore it', peer => {
    for (const id of ['sub', 's0', 's1', 's0x']) peer.driver.execute('UPDATE nodes SET deleted_at = NULL, updated_at = ? WHERE id = ?', [later(3), id]);
    return ['sub', 's0', 's1', 's0x'];
  }],
  ['reorder a folder', peer => {
    saveLocalCurrentParentOrder(peer.driver, { parentId: 'work', childIds: ['sub', 't2', 't0'], now: later(4), hostName: peer.name });
    return ['work'];
  }],
  ['reorder the root', peer => {
    saveLocalCurrentParentOrder(peer.driver, { parentId: ROOT_CHILD_ORDER_ID, childIds: ['archive', 'work'], now: later(5), hostName: peer.name });
    return [];
  }],
  ['create a folder with a child', peer => {
    peer.driver.execute('INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['new', 'work', 'folder', 'new', '', later(6), later(6)]);
    peer.driver.execute('INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['new-child', 'new', 'topic', 'new-child', 'Body', later(6), later(6)]);
    return ['new', 'new-child'];
  }],
  ['delete a topic and its child permanently, announcing only the topic', peer => {
    peer.driver.execute('DELETE FROM nodes WHERE id IN (?, ?)', ['t2x', 't2']);
    return ['t2'];
  }]
];

/** Rows each refresh reads, after checking it against a complete reread in the same running instance. */
function refreshRows(archiveFolders: number) {
  const peer = openLibrary(archiveFolders);
  let current = { ...createInitialWorkspaceState(), ...loadWorkspaceListSnapshot(peer.driver)! } as WorkspaceState;
  const rows: number[] = [];
  for (const [name, apply] of changes) {
    const roots = apply(peer);
    let read = 0;
    const { queryAll, queryOne } = peer.driver;
    peer.driver.queryAll = ((...args: Parameters<typeof queryAll>) => {
      const result = queryAll.apply(peer.driver, args);
      read += result.length;
      return result;
    }) as typeof queryAll;
    peer.driver.queryOne = ((...args: Parameters<typeof queryOne>) => {
      const result = queryOne.apply(peer.driver, args);
      read += result ? 1 : 0;
      return result;
    }) as typeof queryOne;
    let projection;
    try {
      projection = loadWorkspaceListProjection(peer.driver, { nodeIds: roots, structure: true,
        structureNodeIds: listKnownStructureNodeIds(current, roots) });
    } finally { Object.assign(peer.driver, { queryAll, queryOne }); }
    rows.push(read);
    current = mergeWorkspaceSyncProjection(current, projection);
    const complete = loadWorkspaceListSnapshot(peer.driver, { includePdfOpenings: false })!;
    expect(current.nodeOrder, name).toEqual(complete.nodeOrder);
    expect(current.trashedNodeIds, name).toEqual(complete.trashedNodeIds);
    expect(current.nodesById, name).toEqual(complete.nodesById);
  }
  return rows;
}

it('rereads only the changed part of the list for structural changes, matching a complete reread', () => {
  const small = refreshRows(20);
  const large = refreshRows(80);
  expect(Object.fromEntries(changes.map(([name], index) => [name, large[index]])))
    .toEqual(Object.fromEntries(changes.map(([name], index) => [name, small[index]])));
});
