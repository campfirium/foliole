// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver.js';
import { assertPersisted, closeLibraries, createPeer, edit, joinPeers, startLibraries } from '../../electron/database/syncLibrary.testSupport.js';
import { syncRequestLibrary } from '../../electron/database/syncRequestLibrary.testSupport.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { saveNodeReviewStateWithSync } from '../../lib/core/database/nodeReviewSyncState.js';
import { loadWorkspaceListProjection } from '../../lib/core/database/workspaceListProjection.js';
import { loadWorkspaceListSnapshot } from '../../lib/core/database/workspaceListSnapshot.js';
import { WorkspaceSnapshotRefresh, type WorkspaceRefreshScope } from '../../lib/core/database/workspaceSnapshotRefresh.js';

import { createInitialWorkspaceState } from './workspaceStore.js';
import type { WorkspaceState } from './workspaceStoreTypes.js';
import { mergeWorkspaceSyncProjection } from './workspaceSyncProjectionMerge.js';


beforeEach(startLibraries);
afterEach(closeLibraries);

it('refreshes an ordinary committed article without rereading unrelated nodes or order', async () => {
  const source = createPeer('source'); const target = createPeer('target');
  joinPeers(source, target);
  edit(source, 'Original article');
  await syncRequestLibrary(source, target);
  const now = '2026-01-01T00:00:00Z';
  target.driver.transaction(driver => {
    for (let index = 0; index < 3800; index++) driver.execute(
      'INSERT INTO nodes (id, title, kind, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [`unrelated-${index}`, 'Unrelated', 'topic', 'Large irrelevant text '.repeat(40), now, now]);
  });
  const before = loadWorkspaceListSnapshot(target.driver, { includePdfOpenings: false })!;
  edit(source, 'Changed article');
  const scopes: WorkspaceRefreshScope[] = [];
  await syncRequestLibrary(source, target, scope => scopes.push(scope));
  expect(scopes).toContainEqual({ kind: 'nodes', nodeIds: ['topic'] });
  const reads = vi.spyOn(target.driver, 'queryAll');
  const projection = loadWorkspaceListProjection(target.driver, { nodeIds: ['topic'], structure: false });
  expect(Object.keys(projection.nodesById)).toEqual(['topic']);
  expect(projection.structure).toBeNull();
  expect(reads.mock.calls.some(([statement]) => statement.includes('SELECT id, parent_id, created_at, deleted_at FROM nodes'))).toBe(false);
  const current = { ...createInitialWorkspaceState(), ...before } as WorkspaceState;
  const next = mergeWorkspaceSyncProjection(current, projection);
  const complete = loadWorkspaceListSnapshot(target.driver, { includePdfOpenings: false })!;
  expect(next.nodesById.topic).toEqual(complete.nodesById.topic);
  expect(next.nodeOrder).toEqual(complete.nodeOrder);
  expect(next.nodesById['unrelated-0']).toEqual(current.nodesById['unrelated-0']);
  expect(JSON.stringify(projection).length).toBeLessThan(6000);
});

it('merges creation, move, soft delete, restoration, physical deletion and ordering using only affected node details', () => {
  const peer = createPeer('peer');
  edit(peer, 'Original article');
  const before = loadWorkspaceListSnapshot(peer.driver)!;
  let current = { ...createInitialWorkspaceState(), ...before } as WorkspaceState;
  const now = '2027-01-01T00:00:00Z';
  peer.driver.execute('INSERT INTO nodes (id, title, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['folder', 'Folder', 'folder', now, now]);
  peer.driver.execute('UPDATE nodes SET parent_id = ?, updated_at = ? WHERE id = ?', ['folder', now, 'topic']);
  const refresh = (roots: string[]) => {
    const projection = loadWorkspaceListProjection(peer.driver, { nodeIds: roots, structure: true });
    current = mergeWorkspaceSyncProjection(current, projection);
    const expected = loadWorkspaceListSnapshot(peer.driver, { includePdfOpenings: false })!;
    expect(current.nodeOrder).toEqual(expected.nodeOrder);
    expect(current.trashedNodeIds).toEqual(expected.trashedNodeIds);
    expect(current.nodesById).toEqual(expected.nodesById);
  };
  refresh(['folder', 'topic']);
  peer.driver.execute('UPDATE nodes SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, 'folder']);
  refresh(['folder']);
  peer.driver.execute('UPDATE nodes SET deleted_at = NULL, updated_at = ? WHERE id = ?', ['2027-01-02T00:00:00Z', 'folder']);
  refresh(['folder']);
  peer.driver.execute('DELETE FROM nodes WHERE id = ?', ['topic']);
  refresh(['topic']);
});

it('projects committed reading and review state narrowly through real peer synchronization', async () => {
  const source = createPeer('source'); const target = createPeer('target');
  joinPeers(source, target);
  edit(source, 'Article');
  await syncRequestLibrary(source, target);
  const before = loadWorkspaceListSnapshot(target.driver)!;
  const now = '2026-10-19T00:00:00Z';
  saveNodeReadingStateWithSync(source.driver, { nodeId: 'topic', hostName: source.name, updatedAt: now,
    reading: { intervalDurationMs: 1000, intervalGrowthFactor: 2, lastHandledAt: now, nextAt: now,
      priority: 50, readingPosition: 0, repetitionCount: 1, state: 'active' } });
  saveNodeReviewStateWithSync(source.driver, { nodeId: 'topic', hostName: source.name, updatedAt: now,
    review: { difficulty: 5, due: now, elapsedDays: 1, lapses: 0, lastReviewAt: now,
      reps: 1, scheduledDays: 1, stability: 3, state: 2 } });
  const scopes: WorkspaceRefreshScope[] = [];
  await syncRequestLibrary(source, target, scope => scopes.push(scope));
  expect(scopes.length).toBeGreaterThan(0);
  expect(scopes.every(scope => scope.kind === 'nodes')).toBe(true);
  const projection = loadWorkspaceListProjection(target.driver, { nodeIds: ['topic'], structure: false });
  const current = { ...createInitialWorkspaceState(), ...before } as WorkspaceState;
  const refreshed = mergeWorkspaceSyncProjection(current, projection);
  expect(refreshed.nodesById.topic).toEqual(loadWorkspaceListSnapshot(target.driver)?.nodesById.topic);
  saveNodeReadingStateWithSync(source.driver, { nodeId: 'topic', hostName: source.name,
    updatedAt: '2026-10-20T00:00:00Z', reading: null });
  saveNodeReviewStateWithSync(source.driver, { nodeId: 'topic', hostName: source.name,
    updatedAt: '2026-10-20T00:00:00Z', review: null });
  await syncRequestLibrary(source, target);
  const reset = loadWorkspaceListProjection(target.driver, { nodeIds: ['topic'], structure: false });
  expect(mergeWorkspaceSyncProjection(refreshed, reset).nodesById.topic)
    .toEqual(loadWorkspaceListSnapshot(target.driver)?.nodesById.topic);
});

it('preserves directory membership and parent ordering after peer creation and reparenting', async () => {
  const source = createPeer('source'); const target = createPeer('target');
  joinPeers(source, target);
  edit(source, 'Article');
  await syncRequestLibrary(source, target);
  let current = { ...createInitialWorkspaceState(), ...loadWorkspaceListSnapshot(target.driver)! } as WorkspaceState;
  const write = (nodeId: string, parentNodeId: string | null, kind: 'topic' | 'folder', now: string) => {
    upsertNodeSnapshot(source.driver, { nodeId, parentNodeId, kind, title: nodeId, content: '',
      createdAt: '2026-09-30T00:00:00Z', updatedAt: now, hostName: source.name,
      position: null, isTitleManual: true, anchorLink: null, reveal: null });
    flushNodeSyncVersionWithDriver(source.driver, nodeId, source.name, now);
  };
  const refresh = async () => {
    const scopes: WorkspaceRefreshScope[] = [];
    await syncRequestLibrary(source, target, scope => scopes.push(scope));
    expect(scopes.every(scope => scope.kind === 'nodes')).toBe(true);
    const roots = scopes.flatMap(scope => scope.kind === 'nodes' ? [...scope.nodeIds] : []);
    current = mergeWorkspaceSyncProjection(current,
      loadWorkspaceListProjection(target.driver, { nodeIds: roots, structure: true }));
    const expected = loadWorkspaceListSnapshot(target.driver)!;
    expect(current.nodeOrder).toEqual(expected.nodeOrder);
    expect(current.nodesById).toEqual(expected.nodesById);
  };
  write('folder', null, 'folder', '2026-10-19T00:00:00Z');
  write('child', 'folder', 'topic', '2026-10-19T00:00:01Z');
  await refresh();
  write('child', null, 'topic', '2026-10-19T00:00:02Z');
  await refresh();
});


it('drains a later real peer commit while an earlier SQLite projection is awaiting publication', async () => {
  const source = createPeer('source'); const target = createPeer('target');
  joinPeers(source, target);
  edit(source, 'Initial body');
  await syncRequestLibrary(source, target);
  const initial = { ...createInitialWorkspaceState(), ...loadWorkspaceListSnapshot(target.driver)! } as WorkspaceState;
  let reached!: () => void;
  const reading = new Promise<void>(resolve => { reached = resolve; });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  const snapshots = new WorkspaceSnapshotRefresh(initial, async ({ current, scope }) => {
    if (scope.kind !== 'nodes') throw new Error('ordinary_body_scope_must_be_narrow');
    const projection = loadWorkspaceListProjection(target.driver, { nodeIds: scope.nodeIds, structure: false });
    if (++reads === 1) { reached(); await held; }
    return mergeWorkspaceSyncProjection(current, projection);
  });
  edit(source, 'First body');
  await syncRequestLibrary(source, target, scope => snapshots.register(scope));
  const pending = snapshots.refresh();
  await reading;
  const version = edit(source, 'Second body committed during publication');
  await syncRequestLibrary(source, target, scope => snapshots.register(scope));
  release();
  await pending;
  expect(reads).toBe(2);
  expect(snapshots.getSnapshot().nodesById.topic).toEqual(loadWorkspaceListSnapshot(target.driver)?.nodesById.topic);
  assertPersisted(source, 'Second body committed during publication', version);
  assertPersisted(target, 'Second body committed during publication', version);
});


it('refreshes inherited openings from scoped SQLite facts and preserves unrelated list identities', () => {
  const peer = createPeer('peer');
  const now = '2026-01-01T00:00:00Z';
  for (const [id, parent, kind, opening] of [
    ['root', null, 'topic', null], ['branch', 'root', 'folder', null],
    ['leaf', 'branch', 'topic', 'First opening'], ['unrelated', null, 'topic', 'Other opening']
  ] as const) peer.driver.execute(
    'INSERT INTO nodes (id, parent_id, kind, title, opening_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, parent, kind, id, opening, now, now]);
  let current = { ...createInitialWorkspaceState(), ...loadWorkspaceListSnapshot(peer.driver)! } as WorkspaceState;
  const unrelated = current.nodesById.unrelated;
  for (const opening of ['Second opening', null, 'Restored opening']) {
    peer.driver.execute('UPDATE nodes SET opening_text = ?, updated_at = ? WHERE id = ?',
      [opening, '2027-01-01T00:00:00Z', 'leaf']);
    const projection = loadWorkspaceListProjection(peer.driver, { nodeIds: ['leaf'], structure: false });
    current = mergeWorkspaceSyncProjection(current, projection);
    const expected = loadWorkspaceListSnapshot(peer.driver, { includePdfOpenings: false })!;
    expect(current.nodesById).toEqual(expected.nodesById);
    expect(current.nodeOrder).toEqual(expected.nodeOrder);
    expect(current.nodesById.unrelated).toBe(unrelated);
  }
});
