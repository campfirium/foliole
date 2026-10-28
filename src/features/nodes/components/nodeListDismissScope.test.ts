import { expect, it } from 'vitest';

import { patchWorkspaceRecord } from '../../../shared/workspaceRecordPatch';
import type { Node } from '../model/nodeTypes';
import { projectWorkspaceListNodesById } from '../model/workspaceListNode';
import { prepareWorkspaceNodeChildrenIndex } from '../model/workspaceNodeChildrenIndex';

import { collectDismissEntireTopicTargets, hasDismissEntireTopicTargets } from './nodeListContextMenuReview';

function node(id: string, parentNodeId: string | null): Node {
  return { id, parentNodeId, kind: 'topic', content: 'Text', hasContent: true,
    hasReveal: false, title: id, createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z', review: null, reading: null, reveal: null };
}

it('uses prepared source children for menu visibility without reading unrelated projected parents', () => {
  const source = { root: node('root', null), child: node('child', 'root'),
    deep: node('deep', 'child'), other: node('other', null) };
  prepareWorkspaceNodeChildrenIndex(source);
  const projected = projectWorkspaceListNodesById(source);
  let reads = 0;
  for (const value of Object.values(projected)) {
    const parent = value!.parentNodeId;
    Object.defineProperty(value, 'parentNodeId', { get() { reads++; return parent; } });
  }
  expect(hasDismissEntireTopicTargets(['root'], projected)).toBe(true);
  expect(collectDismissEntireTopicTargets('root', projected)).toEqual(['root', 'child', 'deep']);
  expect(reads).toBe(0);
});

it('walks through ineligible and missing-key members while retaining aliases and undefined entries', () => {
  const source = projectWorkspaceListNodesById({ root: node('root', null),
    alias: node('missing-key', 'root'), deep: node('deep', 'missing-key'),
    card: { ...node('card', 'root'), kind: 'item' as const },
    below: node('below', 'card'), duplicate: node('below', 'card'), empty: undefined });
  expect(collectDismissEntireTopicTargets('root', source)).toEqual(['root', 'deep', 'below', 'below']);
  expect(hasDismissEntireTopicTargets(['card'], source)).toBe(false);
});

it('preserves undefined-slot revival order and the earlier snapshot through a hinted transition', () => {
  const initial: Record<string, Node | undefined> = { root: node('root', null),
    a: undefined, b: node('b', 'root') };
  const previous = prepareWorkspaceNodeChildrenIndex(initial);
  const next = patchWorkspaceRecord(initial, { a: node('a', 'root') });
  const current = prepareWorkspaceNodeChildrenIndex(next);
  expect(current.children.get('root')?.map(member => member.id)).toEqual(['a', 'b']);
  expect(previous.children.get('root')?.map(member => member.id)).toEqual(['b']);
  const removed = patchWorkspaceRecord(next, { b: undefined });
  expect(prepareWorkspaceNodeChildrenIndex(removed).children.get('root')?.map(member => member.id)).toEqual(['a']);
  expect(current.children.get('root')?.map(member => member.id)).toEqual(['a', 'b']);
});
