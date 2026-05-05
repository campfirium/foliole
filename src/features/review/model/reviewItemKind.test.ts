import { expect, it } from 'vitest';

import type { Node } from '../../nodes/model/nodeTypes';

import { getReviewItemKind } from './reviewItemKind';

function createNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'node-1',
    parentNodeId: null,
    title: 'Node',
    content: 'Body',
    reveal: null,
    anchorLink: null,
    reading: null,
    review: null,
    createdAt: '2026-03-17T00:00:00.000Z',
    updatedAt: '2026-03-17T00:00:00.000Z',
    ...overrides
  };
}

it('treats reading nodes as reading items', () => {
  expect(getReviewItemKind(createNode())).toBe('reading');
});

it('treats nodes with review profile as fsrs items even when reveal is empty', () => {
  expect(
    getReviewItemKind(
      createNode({
        reveal: '',
        review: {
          due: '2026-03-17T00:00:00.000Z',
          lastReviewAt: null,
          state: 0,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0
        }
      })
    )
  ).toBe('fsrs');
});

it('treats cloze-derived nodes as fsrs items', () => {
  expect(
    getReviewItemKind(
      createNode({
        reveal: '',
        anchorLink: { id: 'cloze-1', kind: 'cloze' }
      })
    )
  ).toBe('fsrs');
});
