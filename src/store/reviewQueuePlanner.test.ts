import { expect, it } from 'vitest';

import { buildReviewQueuePlan } from './reviewQueuePlanner';
import {
  createClozeReviewNode,
  createPlannerBackedQueueNodes,
  createReadingNode,
  createReadingProfile,
  createReviewNode
} from './reviewQueuePlanner.test-support';

it('assembles dedicated FSRS and reading queues, then mixes them at the spec 5:1 ratio', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = [
    createReviewNode('fsrs-1', '2026-03-01T08:00:00.000Z', { reps: 4, state: 2 }),
    createReadingNode('reading-1', '2026-03-02T08:00:00.000Z'),
    createReviewNode('fsrs-2', '2026-03-02T08:00:00.000Z', { reps: 3, state: 2 }),
    createReviewNode('fsrs-3', '2026-03-03T08:00:00.000Z', { reps: 2, state: 2 }),
    createReviewNode('fsrs-4', '2026-03-04T08:00:00.000Z', { reps: 2, state: 2 }),
    createReadingNode('reading-2', '2026-03-05T08:00:00.000Z'),
    createReviewNode('fsrs-5', '2026-03-05T08:00:00.000Z', { reps: 1, state: 1 }),
    createReviewNode('fsrs-6', '2026-03-06T08:00:00.000Z', { reps: 1, state: 1 })
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.fsrsQueueNodeIds).toEqual(['fsrs-1', 'fsrs-2', 'fsrs-3', 'fsrs-4', 'fsrs-5', 'fsrs-6']);
  expect(plan.readingQueueNodeIds).toEqual(['reading-1', 'reading-2']);
  expect(plan.queueNodeIds).toEqual(['fsrs-1', 'fsrs-2', 'fsrs-3', 'fsrs-4', 'fsrs-5', 'reading-1', 'fsrs-6']);
  expect(plan.fsrsCandidateCount).toBe(6);
  expect(plan.readingCandidateCount).toBe(2);
  expect(plan.overflowCount).toBe(1);
});

it('removes the legacy daily cap but keeps the task queue item-centered', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const fsrsNodes = Array.from({ length: 12 }, (_, index) =>
    createReviewNode(`fsrs-${index + 1}`, `2026-02-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`, {
      reps: 2,
      state: 2
    })
  );
  const readingNodes = Array.from({ length: 3 }, (_, index) =>
    createReadingNode(`reading-${index + 1}`, `2026-02-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`)
  );
  const nodes = [...fsrsNodes, ...readingNodes];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.queueNodeIds).toHaveLength(14);
  expect(plan.queueNodeIds).toEqual([
    'fsrs-1',
    'fsrs-2',
    'fsrs-3',
    'fsrs-4',
    'fsrs-5',
    'reading-1',
    'fsrs-6',
    'fsrs-7',
    'fsrs-8',
    'fsrs-9',
    'fsrs-10',
    'reading-2',
    'fsrs-11',
    'fsrs-12'
  ]);
  expect(plan.overflowCount).toBe(1);
});

it('keeps empty structure-only nodes out of the reading queue', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = [
    createReviewNode('fsrs-1', '2026-03-01T08:00:00.000Z', { reps: 1, state: 1 }),
    createReadingNode('reading-1', '2026-03-02T08:00:00.000Z'),
    createReadingNode('reading-empty', '2026-03-03T08:00:00.000Z', '   ')
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.readingQueueNodeIds).toEqual(['reading-1']);
  expect(plan.queueNodeIds).toEqual(['fsrs-1']);
});

it('does not pull the whole reading lane into a small item-centered task queue', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const fsrsNodes = Array.from({ length: 3 }, (_, index) =>
    createReviewNode(`fsrs-${index + 1}`, `2026-02-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`, {
      reps: 2,
      state: 2
    })
  );
  const readingNodes = Array.from({ length: 12 }, (_, index) =>
    createReadingNode(`reading-${index + 1}`, `2026-02-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`)
  );
  const nodes = [...fsrsNodes, ...readingNodes];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.queueNodeIds).toEqual(['fsrs-1', 'fsrs-2', 'fsrs-3']);
  expect(plan.overflowCount).toBe(12);
});

it('source-interleaves due reading nodes by direct parent and planner order', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = Array.from({ length: 12 }, (_, index) => ({
    ...createReadingNode(`reading-${index + 1}`, '2026-03-02T08:00:00.000Z'),
    parentNodeId: 'source-topic'
  }));
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.readingQueueNodeIds).toEqual([
    'reading-1',
    'reading-8',
    'reading-3',
    'reading-10',
    'reading-5',
    'reading-12',
    'reading-7',
    'reading-2',
    'reading-9',
    'reading-4',
    'reading-11',
    'reading-6'
  ]);
});

it('keeps scheduled reading inspection ordered by nextAt without source interleaving', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = [
    {
      ...createReadingNode('reading-late', '2026-03-01T08:00:00.000Z', 'reading content', createReadingProfile('2026-03-13T08:00:00.000Z')),
      parentNodeId: 'source-topic'
    },
    {
      ...createReadingNode('reading-early', '2026-03-01T08:00:00.000Z', 'reading content', createReadingProfile('2026-03-11T08:00:00.000Z')),
      parentNodeId: 'source-topic'
    },
    {
      ...createReadingNode('reading-middle', '2026-03-01T08:00:00.000Z', 'reading content', createReadingProfile('2026-03-12T08:00:00.000Z')),
      parentNodeId: 'source-topic'
    }
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ includeScheduled: true, nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.readingQueueNodeIds).toEqual(['reading-early', 'reading-middle', 'reading-late']);
});

it('queues cloze review nodes in the FSRS lane even when reveal is empty', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = [
    createClozeReviewNode('cloze-1', '2026-03-01T08:00:00.000Z', { reps: 1, state: 1 }),
    createReadingNode('reading-1', '2026-03-02T08:00:00.000Z')
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.fsrsQueueNodeIds).toEqual(['cloze-1']);
  expect(plan.readingQueueNodeIds).toEqual(['reading-1']);
  expect(plan.queueNodeIds).toEqual(['cloze-1']);
});

it('keeps topic nodes in the reading lane and item nodes in the fsrs lane based on kind', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const topicNode = createReadingNode('topic-reveal', '2026-03-02T08:00:00.000Z');
  topicNode.reveal = 'answer';
  const itemNode = createReadingNode('item-no-reveal', '2026-03-02T08:00:00.000Z');
  itemNode.kind = 'item';
  itemNode.reading = null;
  const folderNode = createReadingNode('folder-content', '2026-03-02T08:00:00.000Z');
  folderNode.kind = 'folder';
  const nodes = [topicNode, itemNode, folderNode];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.readingQueueNodeIds).toEqual(['topic-reveal']);
  expect(plan.fsrsQueueNodeIds).toEqual(['item-no-reveal']);
  expect(plan.queueNodeIds).toEqual(['item-no-reveal']);
});

it('can build the whole queue including scheduled review items for queue inspection', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = [
    createClozeReviewNode('cloze-scheduled', '2026-03-19T08:00:00.000Z', { reps: 10, state: 2 }),
    createReadingNode('reading-due', '2026-03-02T08:00:00.000Z')
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ includeScheduled: true, nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.fsrsQueueNodeIds).toEqual(['cloze-scheduled']);
  expect(plan.readingQueueNodeIds).toEqual(['reading-due']);
  expect(plan.queueNodeIds).toEqual(['cloze-scheduled']);
});

it('replaces legacy due and createdAt ordering with inherited priority, FSRS retrievability, and reading nextAt', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = createPlannerBackedQueueNodes();
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.fsrsQueueNodeIds).toEqual([
    'fsrs-absolute',
    'fsrs-low-r',
    'fsrs-4',
    'fsrs-5',
    'fsrs-6',
    'fsrs-high-r'
  ]);
  expect(plan.readingQueueNodeIds).toEqual(['reading-early-nextAt', 'reading-late-nextAt']);
  expect(plan.queueNodeIds).toEqual([
    'fsrs-absolute',
    'fsrs-low-r',
    'fsrs-4',
    'fsrs-5',
    'fsrs-6',
    'reading-early-nextAt',
    'fsrs-high-r'
  ]);
  expect(plan.fsrsQueueNodeIds).not.toEqual([
    'fsrs-absolute',
    'fsrs-high-r',
    'fsrs-6',
    'fsrs-5',
    'fsrs-4',
    'fsrs-low-r'
  ]);
});
