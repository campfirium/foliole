import { expect, it } from 'vitest';

import { createStoredSyncState } from '../../companionWorkspaceSync.testSupport';

import { companionReadingDemandKey } from './companionReadingDemand';

function source() { return createStoredSyncState().workspace_snapshot!; }
const anchor = { id: 'anchor', kind: 'highlight' as const, locator: { from: 0, to: 4, originalText: 'body' } };

it('rechecks current content and annotation facts without revisiting unrelated relations in the same catalog', () => {
  const snapshot = source();
  let visits = 0;
  for (let index = 0; index < 3000; index += 1) {
    const id = `unrelated-${index}`;
    snapshot.nodesById[id] = { ...snapshot.nodesById['node-1']!, id,
      get parentNodeId() { visits += 1; return null; },
      get anchorLink() { visits += 1; return null; } };
  }
  snapshot.nodesById.note = { ...snapshot.nodesById['node-1']!, id: 'note', parentNodeId: 'node-1', anchorLink: anchor };
  const initial = companionReadingDemandKey(snapshot, 'node-1');
  visits = 0;
  for (let index = 0; index < 4; index += 1) {
    expect(companionReadingDemandKey(snapshot, 'node-1')).toBe(initial);
    expect(companionReadingDemandKey(snapshot, 'node-2')).toBeTruthy();
  }
  expect(visits).toBe(0);
  snapshot.nodesById.note.content = 'Updated annotation';
  expect(companionReadingDemandKey(snapshot, 'node-1')).not.toBe(initial);
  const annotated = companionReadingDemandKey(snapshot, 'node-1');
  snapshot.nodesById['node-1']!.content = 'Updated inline body';
  expect(companionReadingDemandKey(snapshot, 'node-1')).not.toBe(annotated);
});

it('invalidates annotation addition, removal, reparenting and deletion in replacement catalogs', () => {
  const snapshot = source();
  const initial = companionReadingDemandKey(snapshot, 'node-1');
  const note = { ...snapshot.nodesById['node-1']!, id: 'note', parentNodeId: 'node-1', anchorLink: anchor };
  const added = { ...snapshot, nodesById: { ...snapshot.nodesById, note } };
  const annotated = companionReadingDemandKey(added, 'node-1');
  expect(annotated).not.toBe(initial);
  expect(companionReadingDemandKey({ ...added, nodesById: { ...snapshot.nodesById } }, 'node-1')).toBe(initial);
  const moved = { ...added, nodesById: { ...added.nodesById, note: { ...note, parentNodeId: 'node-2' } } };
  expect(companionReadingDemandKey(moved, 'node-1')).toBe(initial);
  expect(companionReadingDemandKey(moved, 'node-2')).not.toBe(companionReadingDemandKey(snapshot, 'node-2'));
  const deleted = { ...added, nodesById: { ...added.nodesById, note: { ...note, deletedAt: '2026-10-27T00:00:00Z' } } };
  expect(companionReadingDemandKey(deleted, 'node-1')).not.toBe(annotated);
  expect(companionReadingDemandKey({ ...added, libraryScope: 'other' }, 'node-1')).not.toBe(annotated);
  expect(companionReadingDemandKey({ ...added, trashedNodeIds: ['note'] }, 'node-1')).not.toBe(annotated);
});
