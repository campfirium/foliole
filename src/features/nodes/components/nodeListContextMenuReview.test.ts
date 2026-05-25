import { expect, it } from 'vitest';

import { definedProps } from '../../../shared/lib/definedProps';
import type { WorkspaceListNode } from '../model/workspaceListNode';

import {
  canDismissNode,
  canRelearnNode,
  canReturnNode,
  collectDismissEntireTopicTargets,
  hasDismissEntireTopicTargets
} from './nodeListContextMenuReview';

function createReadingState(state: 'active' | 'done' | 'dismissed' = 'active') {
  return {
    intervalDurationMs: 0,
    intervalGrowthFactor: 1,
    lastHandledAt: '2026-03-29T00:00:00.000Z',
    nextAt: '2026-03-29T00:00:00.000Z',
    priority: 0,
    readingPosition: 0,
    repetitionCount: 0,
    state
  };
}

function createNode(
  input: Partial<WorkspaceListNode> & Pick<WorkspaceListNode, 'id' | 'title'>
): WorkspaceListNode {
  return {
    id: input.id,
    parentNodeId: input.parentNodeId ?? null,
    title: input.title,
    hasContent: input.hasContent ?? true,
    hasReveal: input.hasReveal ?? false,
    anchorLink: input.anchorLink ?? null,
    reading: input.reading ?? null,
    review: input.review ?? null,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...definedProps({ kind: input.kind, specialKind: input.specialKind })
  };
}

  it('allows relearn for ordinary learning nodes even before content or progress exists', () => {
    expect(canReturnNode(createNode({ id: 'node-1', kind: 'topic', title: 'Atlas', hasContent: true, reading: null }))).toBe(true);
    expect(canReturnNode(createNode({ id: 'node-2', kind: 'topic', title: 'Empty', hasContent: false }))).toBe(true);
    expect(canReturnNode(createNode({ id: 'node-3', kind: 'folder', title: 'Folder', hasContent: false }))).toBe(false);
    expect(canReturnNode(createNode({ id: 'node-4', kind: 'topic', title: 'Virtual', specialKind: 'virtual' }))).toBe(false);
  });

  it('allows dismiss only for reading items that still need handling', () => {
    expect(canDismissNode(createNode({
      id: 'node-1',
      kind: 'topic',
      title: 'Reading',
      reading: createReadingState()
    }))).toBe(true);
    expect(canDismissNode(createNode({ id: 'node-2', kind: 'item', title: 'Card', hasReveal: true }))).toBe(false);
    expect(
      canDismissNode(
        createNode({
          id: 'node-3',
          kind: 'folder',
          title: 'Folder',
          reading: createReadingState()
        })
      )
    ).toBe(false);
  });

  it('allows relearn without loading reveal text', () => {
    expect(canRelearnNode(createNode({ id: 'node-1', kind: 'item', title: 'Card', hasReveal: true }))).toBe(true);
  });

  it('allows returning topics with reveal because kind still wins', () => {
    expect(
      canReturnNode(
        createNode({
          id: 'node-1',
          kind: 'topic',
          title: 'Topic',
          hasReveal: true,
          reading: createReadingState('dismissed')
        })
      )
    ).toBe(true);
  });

  it('collects the topic itself and nested reading topics for entire-topic dismiss', () => {
    const nodesById = {
      root: createNode({ id: 'root', kind: 'topic', title: 'Root', reading: createReadingState('dismissed') }),
      child: createNode({ id: 'child', kind: 'topic', parentNodeId: 'root', title: 'Child', reading: createReadingState() }),
      grandchild: createNode({ id: 'grandchild', kind: 'topic', parentNodeId: 'child', title: 'Grandchild', reading: createReadingState() }),
      card: createNode({ id: 'card', kind: 'item', parentNodeId: 'root', title: 'Card', hasReveal: true })
    };

    expect(collectDismissEntireTopicTargets('root', nodesById)).toEqual(['child', 'grandchild']);
    expect(hasDismissEntireTopicTargets(['root'], nodesById)).toBe(true);
  });

  it('keeps entire-topic dismiss scoped to one topic target', () => {
    const nodesById = {
      root: createNode({ id: 'root', kind: 'topic', title: 'Root', reading: createReadingState() }),
      folder: createNode({ id: 'folder', kind: 'folder', title: 'Folder', reading: createReadingState() })
    };

    expect(hasDismissEntireTopicTargets(['root', 'folder'], nodesById)).toBe(false);
    expect(hasDismissEntireTopicTargets(['folder'], nodesById)).toBe(false);
  });
