import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';

import { buildReviewQueueVisibility } from './reviewQueueVisibility';

function createNode(id: string, overrides: Partial<Node>): Node {
  return {
    id,
    parentNodeId: null,
    priority: null,
    desiredRetention: null,
    title: id,
    content: 'content',
    reveal: null,
    review: null,
    createdAt: '2026-03-10T08:00:00.000Z',
    updatedAt: '2026-03-10T08:00:00.000Z',
    ...overrides
  };
}

function createVisibilityTestNodes(): Record<string, Node> {
  return {
    'fsrs-1': createNode('fsrs-1', {
      reveal: 'answer',
      review: {
        due: '2026-03-10T08:00:00.000Z',
        lastReviewAt: null,
        state: 1,
        stability: 3,
        difficulty: 4,
        elapsedDays: 1,
        scheduledDays: 2,
        reps: 1,
        lapses: 0
      }
    }),
    'reading-1': createNode('reading-1', {
      reading: {
        intervalDurationMs: 86400000,
        intervalGrowthFactor: 1.2,
        lastHandledAt: '2026-03-09T08:00:00.000Z',
        nextAt: '2026-03-10T08:00:00.000Z',
        priority: 4,
        readingPosition: 0,
        repetitionCount: 1,
        state: 'active'
      }
    }),
    'fsrs-2': createNode('fsrs-2', {
      reveal: 'answer',
      review: {
        due: '2026-03-10T08:00:00.000Z',
        lastReviewAt: null,
        state: 2,
        stability: 5,
        difficulty: 4,
        elapsedDays: 2,
        scheduledDays: 4,
        reps: 2,
        lapses: 0
      }
    })
  };
}

it('builds queue visibility from the live review queue and saved mix ratio', () => {
  const visibility = buildReviewQueueVisibility({
    currentNodeId: 'reading-1',
    nodesById: createVisibilityTestNodes(),
    queueNodeIds: ['reading-1', 'fsrs-1', 'fsrs-2'],
    reviewSchedulerSettings: {
      ...DEFAULT_REVIEW_SCHEDULER_SETTINGS,
      pushQueue: {
        ...DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue,
        queueMixRatio: { reading: 2, fsrs: 4 }
      }
    }
  });

  expect(visibility).toEqual({
    currentQueueLabel: 'Reading queue',
    fsrsQueueCount: 2,
    readingQueueCount: 1,
    queueMixRatioFsrs: 4,
    queueMixRatioReading: 2
  });
});

it('counts cloze review nodes as FSRS items in queue visibility', () => {
  const visibility = buildReviewQueueVisibility({
    currentNodeId: 'fsrs-cloze',
    nodesById: {
      ...createVisibilityTestNodes(),
      'fsrs-cloze': createNode('fsrs-cloze', {
        anchorLink: {
          id: 'anchor-1',
          kind: 'cloze'
        },
        review: {
          due: '2026-03-10T08:00:00.000Z',
          lastReviewAt: null,
          state: 2,
          stability: 5,
          difficulty: 4,
          elapsedDays: 2,
          scheduledDays: 4,
          reps: 2,
          lapses: 0
        }
      })
    },
    queueNodeIds: ['fsrs-cloze', 'reading-1'],
    reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS
  });

  expect(visibility).toEqual({
    currentQueueLabel: 'FSRS queue',
    fsrsQueueCount: 1,
    readingQueueCount: 1,
    queueMixRatioFsrs: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue.queueMixRatio.fsrs,
    queueMixRatioReading: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue.queueMixRatio.reading
  });
});
