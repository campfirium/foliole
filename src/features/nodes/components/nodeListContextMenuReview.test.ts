import { describe, expect, it } from 'vitest';

import type { WorkspaceListNode } from '../model/workspaceListNode';

import {
  canDismissNode,
  canRelearnNode,
  canReturnNode
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
    kind: input.kind,
    title: input.title,
    hasContent: input.hasContent ?? true,
    hasReveal: input.hasReveal ?? false,
    anchorLink: input.anchorLink ?? null,
    reading: input.reading ?? null,
    review: input.review ?? null,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z'
  };
}

describe('node list review actions', () => {
  it('treats hasContent as the only content gate', () => {
    expect(canReturnNode(createNode({ id: 'node-1', title: 'Atlas', hasContent: true, reading: null, hasReveal: true }))).toBe(true);
    expect(canReturnNode(createNode({ id: 'node-2', title: 'Empty', hasContent: false, hasReveal: true }))).toBe(false);
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
});
