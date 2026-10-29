import { expect, it } from 'vitest';

import { sequentialReadingState, type SequentialReadingStateNode } from './sequentialReadingState.js';

const node: SequentialReadingStateNode = { id: 'topic', parentNodeId: null, kind: 'topic', title: 'Topic', content: '',
  createdAt: '2026-10-30', updatedAt: '2026-10-30', learningSummary: { reading: { state: 'locked', repetitionCount: 9 } } };

it('uses list state only when complete operation facts have not been loaded', () => {
  expect(sequentialReadingState(node)).toBe('locked');
  expect(sequentialReadingState({ ...node, reading: { state: 'active' } })).toBe('active');
  expect(sequentialReadingState({ ...node, reading: null })).toBeNull();
});
