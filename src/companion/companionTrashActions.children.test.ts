import { beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { prepareWorkspaceNodeChildrenIndex } from '../features/nodes/model/workspaceNodeChildrenIndex';
import { patchWorkspaceRecord } from '../shared/workspaceRecordPatch';

import { restoreCompanionTrashNode } from './companionTrashActions';

const writes = vi.hoisted(() => vi.fn(async (records: { object_id: string }[]) => records.map(record => record.object_id)));
vi.mock('../shared/platform/companionSyncObjects', () => ({ applyCompanionTrashRestoreNodeVersions: writes }));

function node(id: string, parentNodeId: string | null = null, deletedAt: string | null = '2026-10-01'): WorkspaceNodeSnapshot {
  return { id, parentNodeId, deletedAt, kind: 'topic', title: id, content: `Body ${id}`,
    currentVersionId: `base-${id}`, createdAt: '2026-09-01', updatedAt: '2026-10-01',
    anchorLink: null, isTitleManual: false, hideTitleHeading: false, reveal: null, reading: null, review: null };
}

function snapshot(nodesById: WorkspaceSnapshot['nodesById']): WorkspaceSnapshot {
  return { nodesById, nodeOrder: [], activeNodeId: null, trashedNodeIds: [], untitledSequenceByParent: {} };
}

async function restore(nodes: WorkspaceSnapshot['nodesById'], nodeId = 'root') {
  await restoreCompanionTrashNode({ deviceId: 'mobile', nodeId, snapshot: snapshot(nodes), now: '2026-10-29' });
  return writes.mock.lastCall?.[0].map((record: { object_id: string }) => record.object_id);
}

beforeEach(() => { writes.mockClear(); });

it.each([false, true])('reads unrelated parent facts at most once when collecting a subtree (prepared=%s)', async prepared => {
  const nodes: WorkspaceSnapshot['nodesById'] = { root: node('root'), a: node('a', 'root'),
    deep: node('deep', 'a'), b: node('b', 'root') };
  let unrelatedReads = 0;
  for (let i = 0; i < 100; i++) nodes[`other-${i}`] = { ...node(`other-${i}`),
    get parentNodeId() { unrelatedReads++; return null; } };
  if (prepared) prepareWorkspaceNodeChildrenIndex(nodes);
  unrelatedReads = 0;
  expect(await restore(nodes)).toEqual(['root', 'a', 'deep', 'b']);
  expect(unrelatedReads).toBe(prepared ? 0 : 100);
  unrelatedReads = 0;
  expect(await restore(nodes)).toEqual(['root', 'a', 'deep', 'b']);
  expect(unrelatedReads).toBe(0);
});

it('preserves numeric sibling order and traverses visible children to restore trashed grandchildren', async () => {
  const nodes = { root: node('root'), a: node('a', 'root', null), deep: node('deep', 'a'),
    b: node('b', 'root'), '10': node('10', 'root'), '2': node('2', 'root'),
    alias: node('b', 'root'), missing: undefined } as unknown as WorkspaceSnapshot['nodesById'];
  expect(await restore(nodes)).toEqual(['root', '2', '10', 'deep', 'b']);
});

it('uses each input relation after a move and keeps the old input intact', async () => {
  const first = { root: node('root'), a: node('a', 'root'), deep: node('deep', 'a'), b: node('b', 'root') };
  expect(await restore(first, 'a')).toEqual(['a', 'deep']);
  const moved = patchWorkspaceRecord(first, { deep: node('deep', 'b') });
  expect(await restore(moved, 'a')).toEqual(['a']);
  expect(await restore(moved, 'b')).toEqual(['b', 'deep']);
  expect(await restore(first, 'a')).toEqual(['a', 'deep']);
  const otherLibrary = { root: node('root'), independent: node('independent', 'root') };
  expect(await restore(otherLibrary)).toEqual(['root', 'independent']);
});

it('preserves DFS conflict preference when siblings contain nested imported duplicates', async () => {
  const duplicate = (id: string, parent: string | null, live = false) => ({ ...node(id, parent, live ? null : 'trash'),
    importSourceFingerprint: `${id.includes('second') ? 'second' : 'first'}-source`,
    importContentFingerprint: 'same-body' });
  const result = await restoreCompanionTrashNode({ deviceId: 'mobile', nodeId: 'root', snapshot: snapshot({
    root: node('root'), a: node('a', 'root'), second: duplicate('second', 'a'),
    first: duplicate('first', 'root'), 'live-second': duplicate('live-second', null, true),
    'live-first': duplicate('live-first', null, true) }) });
  expect(result?.nodeId).toBe('live-second');
  expect(writes.mock.lastCall?.[0].map((record: { object_id: string }) => record.object_id)).toEqual(['root', 'a']);
  expect(result?.snapshot.trashedNodeIds).toEqual(['second', 'first']);
});

it('does not write for a missing or already visible root', async () => {
  await restore({ root: node('root', null, null) });
  await restore({ another: node('another') });
  expect(writes).not.toHaveBeenCalled();
});
