import { expect, it } from 'vitest';

import type { Node } from '../../nodes/model/nodeTypes';

import { getReviewItemKind } from './reviewItemKind';

function createNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'node-1',
    parentNodeId: null,
    kind: 'topic',
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

it('keeps image excerpts out of review until an explicit cloze is created', () => {
  expect(getReviewItemKind(createNode({
    anchorLink: { id: 'image-1', kind: 'image-excerpt' }
  }))).toBe('none');
});

it('keeps topic nodes in the reading lane even when reveal exists', () => {
  expect(getReviewItemKind(createNode({ kind: 'topic', reveal: 'answer' }))).toBe('reading');
});

it('keeps folder nodes out of review lanes even when content exists', () => {
  expect(getReviewItemKind(createNode({ kind: 'folder', content: 'Folder body' }))).toBe('none');
});

it('treats item nodes as fsrs items even without reveal', () => {
  expect(getReviewItemKind(createNode({ kind: 'item', reveal: null, review: null }))).toBe('fsrs');
});

it('treats nodes with review profile as fsrs items even when reveal is empty', () => {
  expect(
    getReviewItemKind(
      createNode({
        kind: 'item',
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
        kind: 'item',
        reveal: '',
        anchorLink: { id: 'cloze-1', kind: 'cloze' }
      })
    )
  ).toBe('fsrs');
});
