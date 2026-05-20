import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewSessionState } from '../../store/workspaceStore';

import { countCreatedNodesDuringSession } from './layoutPropsBuilder';

function createNode(id: string, kind: Node['kind'], createdAt: string): Node {
  return {
    content: '',
    createdAt,
    id,
    kind,
    parentNodeId: null,
    reveal: null,
    review: null,
    title: id,
    updatedAt: createdAt
  };
}

it('counts created items and topics inside the completed review session window', () => {
  const reviewSession: ReviewSessionState = {
    completedAt: '2026-03-03T12:30:00.000Z',
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: [],
    sessionStartedAt: '2026-03-03T12:00:00.000Z',
    totalNodeCount: 1
  };

  expect(countCreatedNodesDuringSession(reviewSession, {
    folder: createNode('folder', 'folder', '2026-03-03T12:10:00.000Z'),
    item: createNode('item', 'item', '2026-03-03T12:18:00.000Z'),
    late: createNode('late', 'topic', '2026-03-03T12:31:00.000Z'),
    topic: createNode('topic', 'topic', '2026-03-03T12:20:00.000Z')
  })).toEqual({ createdItemCount: 1, createdTopicCount: 1 });
});
