import { expect } from 'vitest';

import { deleteNodesPermanently, softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { applyReviewGrade } from './reviewMutations.js';

export function seedBackupBaseline() {
  seedNode('node-root', '# root', 0);
  seedNode('node-qa', 'Prompt [...]', 1, 'Answer');
  seedNode('node-trash', '# trash', 2);

  softDeleteNodes({ nodeIds: ['node-trash'], deletedAt: '2026-03-14T10:01:00.000Z' });
  applyReviewGrade({
    nodeId: 'node-qa',
    grade: 3,
    reviewedAt: '2026-03-14T10:02:00.000Z',
    schedulerVersion: 'ts-fsrs@4:backup',
    cardBefore: createSchedulerCard('2026-03-14T10:00:00.000Z'),
    cardAfter: {
      ...createSchedulerCard('2026-03-17T10:02:00.000Z'),
      last_review: '2026-03-14T10:02:00.000Z',
      state: 1,
      stability: 2.7,
      difficulty: 3.4,
      elapsed_days: 1,
      scheduled_days: 3,
      reps: 1
    }
  });
}

export function mutateWorkspaceAfterBackup() {
  seedNode('node-root', '# mutated after backup', 0);
  seedNode('node-later', '# later node', 3);
  deleteNodesPermanently({
    nodeIds: ['node-qa', 'node-trash'],
    nodeOrder: ['node-root', 'node-later']
  });
}

export function createRestoredWorkspaceSnapshot() {
  return {
    activeNodeId: 'node-root',
    manualVirtualCollections: [],
    nodeOrder: ['node-root', 'node-qa'],
    nodesById: {
      'node-root': createRestoredNodeSnapshot('node-root', '# root'),
      'node-qa': {
        ...createRestoredNodeSnapshot('node-qa', 'Prompt [...]', 'Answer'),
        review: {
          due: '2026-03-17T10:02:00.000Z',
          lastReviewAt: '2026-03-14T10:02:00.000Z',
          state: 1,
          stability: 2.7,
          difficulty: 3.4,
          elapsedDays: 1,
          scheduledDays: 3,
          reps: 1,
          lapses: 0
        }
      },
      'node-trash': {
        ...createRestoredNodeSnapshot('node-trash', '# trash'),
        deletedAt: '2026-03-14T10:01:00.000Z',
        updatedAt: '2026-03-14T10:01:00.000Z'
      }
    },
    trashedNodeDeletedAtById: {
      'node-trash': '2026-03-14T10:01:00.000Z'
    },
    trashedNodeIds: ['node-trash'],
    untitledSequenceByParent: {}
  };
}

export function applyFollowupReviewGrade() {
  applyReviewGrade({
    nodeId: 'node-qa',
    grade: 1,
    reviewedAt: '2026-03-17T10:02:00.000Z',
    schedulerVersion: 'ts-fsrs@4:followup',
    cardBefore: {
      ...createSchedulerCard('2026-03-17T10:02:00.000Z'),
      last_review: '2026-03-14T10:02:00.000Z',
      state: 1,
      stability: 2.7,
      difficulty: 3.4,
      elapsed_days: 1,
      scheduled_days: 3,
      reps: 1
    },
    cardAfter: {
      ...createSchedulerCard('2026-03-17T10:12:00.000Z'),
      last_review: '2026-03-17T10:02:00.000Z',
      state: 3,
      stability: 1.1,
      difficulty: 4.2,
      elapsed_days: 3,
      scheduled_days: 0,
      reps: 2,
      lapses: 1
    }
  });
}

export function seedNode(nodeId: string, content: string, position = 0, reveal: string | null = null) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId: null,
    kind: reveal === null ? 'topic' : 'item',
    title: nodeId,
    isTitleManual: true,
    content,
    reveal,
    anchorLink: null,
    position,
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z'
  });
}

function createRestoredNodeSnapshot(nodeId: string, content: string, reveal: string | null = null) {
  return {
    id: nodeId,
    parentNodeId: null,
    kind: reveal === null ? 'topic' : 'item',
    title: nodeId,
    isTitleManual: true,
    hideTitleHeading: false,
    bodyBlobHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    content,
    openingText: reveal === null ? null : content,
    virtualFilter: null,
    reveal,
    anchorLink: null,
    reading: null,
    review: null,
    shelvedAt: null,
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z'
  };
}

function createSchedulerCard(due: string) {
  return {
    due,
    last_review: null,
    state: 0 as const,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0
  };
}
