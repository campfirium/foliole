import { expect, it } from 'vitest';

import { findNextSequentialReadingTopic } from './sequentialReadingNextTopic.js';
import type { SequentialReadingStateNode } from './sequentialReadingState.js';

function topic(id: string, parentNodeId: string | null, overrides: Partial<SequentialReadingStateNode> = {}): SequentialReadingStateNode {
  return { id, parentNodeId, title: id, content: 'Body', kind: 'topic', createdAt: '', updatedAt: '', ...overrides };
}

it('follows document order through nested chapters and stops at the book boundary', () => {
  const nodes = [
    topic('library', null, { kind: 'folder', sequentialReadingEnabled: true }),
    topic('book', 'library', { sequentialReadingEnabled: true }),
    topic('chapter-z', 'book'),
    topic('group', 'chapter-z', { content: '' }),
    topic('section', 'group', { reading: { state: 'locked' } }),
    topic('shelved', 'chapter-z', { shelvedAt: '2026-10-26' }),
    topic('unavailable-section', 'shelved'),
    topic('chapter-a', 'book'),
    topic('other-book', 'library')
  ];
  const nodeOrder = nodes.map(node => node.id);
  const nodesById = Object.fromEntries(nodes.map(node => [node.id, node]));
  const next = (currentNodeId: string) => findNextSequentialReadingTopic({ currentNodeId, nodesById, nodeOrder, trashedNodeIds: [] });
  expect(next('book')).toBe('chapter-z');
  expect(next('chapter-z')).toBe('section');
  expect(next('section')).toBe('chapter-a');
  expect(next('chapter-a')).toBeNull();
});

it('honors manual sibling ordering and skips a deleted subtree', () => {
  const nodes = [
    topic('book', null, { kind: 'folder', sequentialReadingEnabled: true, manualChildOrder: ['z', 'trash', 'a'] }),
    topic('a', 'book'),
    topic('z', 'book'),
    topic('trash', 'book'),
    topic('deleted-section', 'trash')
  ];
  const nodesById = Object.fromEntries(nodes.map(node => [node.id, node]));
  expect(findNextSequentialReadingTopic({ currentNodeId: 'z', nodesById, nodeOrder: nodes.map(node => node.id),
    trashedNodeIds: ['trash'] })).toBe('a');
});
