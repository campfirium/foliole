import { expect, it } from 'vitest';

import { collectDocumentOutlineNavigation, countDirectOutlineObjects } from './documentOutlineNavigation';
import { createOutlineFixture } from './documentOutlineNavigation.testSupport';
import { collectVisibleOutlineRows } from './documentOutlineVisibleRows';

function modelFor(fixture: ReturnType<typeof createOutlineFixture>) {
  return collectDocumentOutlineNavigation({ ...fixture.article(), activeNodeId: 'node-1', snapshot: fixture.snapshot });
}

it('keeps descendants under their real parent and counts direct objects without reusing deep source offsets', () => {
  const fixture = createOutlineFixture();
  const child = fixture.add('child', 'Child Topic', 'topic', 'alpha');
  child.hasContent = true;
  child.content = '';
  child.anchorLink = { id: 'child', kind: 'highlight', locator: { from: 28, to: 41, originalText: 'Alpha passage' } };
  fixture.add('grandchild', 'Grandchild Item', 'item', 'child');
  fixture.add('sibling', 'Sibling Item', 'item', 'alpha');
  const model = modelFor(fixture);
  const chapter = model.sections.find(section => section.text === 'Chapter')!;
  expect(countDirectOutlineObjects(chapter.entryIds, model.entries)).toBe(1);
  expect(model.entries.alpha?.childIds).toEqual(['child', 'sibling']);
  expect(model.entries.child?.text).toBe('Child Topic');
  expect(model.entries.child?.action).toBe('card');
  expect(model.entries.child?.selection).toBeUndefined();
  expect(countDirectOutlineObjects(model.entries.alpha!.childIds, model.entries)).toBe(2);
  const initial = collectVisibleOutlineRows(model, new Set(), new Set());
  expect(initial.some(row => row.entry?.id === 'alpha')).toBe(true);
  expect(initial.some(row => row.entry?.id === 'child')).toBe(false);
  const one = collectVisibleOutlineRows(model, new Set(), new Set(['alpha']));
  expect(one.some(row => row.entry?.id === 'child')).toBe(true);
  expect(one.some(row => row.entry?.id === 'grandchild')).toBe(false);
  const two = collectVisibleOutlineRows(model, new Set(), new Set(['alpha', 'child']));
  expect(two.find(row => row.entry?.id === 'grandchild')?.section.id).toBe(chapter.id);
});

it('cuts deleted and missing parent chains instead of promoting their children into the current Outline', () => {
  const fixture = createOutlineFixture();
  fixture.add('hidden-child', 'Hidden child', 'item', 'alpha');
  fixture.add('orphan', 'Orphan', 'topic', 'missing-parent');
  fixture.snapshot.nodesById.alpha!.deletedAt = '2026-11-05T00:00:00Z';
  const model = modelFor(fixture);
  expect(model.entries.alpha).toBeUndefined();
  expect(model.entries['hidden-child']).toBeUndefined();
  expect(model.entries.orphan).toBeUndefined();
  fixture.snapshot.nodesById['node-1']!.deletedAt = '2026-11-05T00:00:00Z';
  const trashed = collectDocumentOutlineNavigation({ content: fixture.snapshot.nodesById['node-1']!.content,
    activeNodeId: 'node-1', snapshot: fixture.snapshot, textAnchorDecorations: [] });
  expect(trashed.entries).toEqual({});
});

it('retains only useful folder containers and excludes them from Topic and Item counts', () => {
  const fixture = createOutlineFixture();
  fixture.add('container', 'Container').kind = 'folder';
  fixture.add('empty-folder', 'Empty folder').kind = 'folder';
  fixture.add('folder-topic', 'Folder Topic', 'topic', 'container');
  fixture.add('folder-item', 'Folder Item', 'item', 'container');
  const model = modelFor(fixture);
  expect(model.entries.container?.action).toBe('container');
  expect(model.entries['empty-folder']).toBeUndefined();
  expect(countDirectOutlineObjects(['container'], model.entries)).toBe(2);
});

it('handles long chains and reachable cycles without recursion or duplicate rows', () => {
  const fixture = createOutlineFixture('Simple text');
  let parent = 'node-1';
  for (let index = 0; index < 2000; index++) {
    const id = `depth-${index}`;
    fixture.add(id, `Depth ${index}`, 'topic', parent);
    parent = id;
  }
  const model = modelFor(fixture);
  const allExpanded = new Set(Object.keys(model.entries));
  const rows = collectVisibleOutlineRows(model, new Set(), allExpanded);
  expect(rows.find(row => row.entry?.id === 'depth-1999')?.depth).toBe(1999);
  expect(new Set(rows.map(row => row.key)).size).toBe(rows.length);
  fixture.snapshot.nodesById['node-1']!.parentNodeId = 'depth-1999';
  const cyclic = collectDocumentOutlineNavigation({ content: 'Simple text', activeNodeId: 'node-1', snapshot: fixture.snapshot, textAnchorDecorations: [] });
  expect(cyclic.entries['node-1']).toBeUndefined();
  expect(Object.keys(cyclic.entries)).toHaveLength(Object.keys(model.entries).length);
});
