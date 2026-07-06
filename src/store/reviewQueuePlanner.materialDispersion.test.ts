import { expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { buildReviewQueuePlan } from './reviewQueuePlanner';
import { createReadingNode, createReadingProfile, createReviewNode } from './reviewQueuePlanner.test-support';

function folder(id: string, parentNodeId: string | null = null, priority?: number): Node {
  return {
    id,
    parentNodeId,
    kind: 'folder',
    ...(priority === undefined ? {} : { priority }),
    title: id,
    content: '',
    reveal: null,
    reading: null,
    review: null,
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z'
  };
}

function buildPlan(nodes: Node[]) {
  return buildReviewQueuePlan({
    nodeOrder: nodes.map((node) => node.id),
    nodesById: Object.fromEntries(nodes.map((node) => [node.id, node])),
    now: '2026-03-21T09:00:00.000Z',
    trashedNodeIds: []
  });
}

function reading(id: string, parentNodeId: string, nextAt = '2026-03-16T09:00:00.000Z', intervalDurationMs = 24 * 60 * 60 * 1000) {
  return {
    ...createReadingNode(id, '2026-03-01T08:00:00.000Z', 'reading content', createReadingProfile(nextAt, { intervalDurationMs })),
    parentNodeId
  };
}

it('material-disperses due reading topics by full node path instead of direct parent only', () => {
  const sourceA = folder('source-a');
  const sourceB = folder('source-b');
  const nodes = [
    sourceA,
    sourceB,
    ...Array.from({ length: 19 }, (_, index) => reading(`a-${String(index + 1).padStart(2, '0')}`, sourceA.id)),
    reading('b-01', sourceB.id)
  ];

  expect(buildPlan(nodes).readingQueueNodeIds.slice(0, 4)).toEqual(['a-01', 'b-01', 'a-19', 'a-18']);
});

it('does not material-disperse scheduled reading inspection output', () => {
  const source = folder('source-a');
  const nodes = [
    source,
    reading('reading-late', source.id, '2026-03-24T09:00:00.000Z'),
    reading('reading-early', source.id, '2026-03-22T09:00:00.000Z'),
    reading('reading-middle', source.id, '2026-03-23T09:00:00.000Z')
  ];
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({
    includeScheduled: true,
    nodeOrder: nodes.map((node) => node.id),
    nodesById,
    now: '2026-03-21T09:00:00.000Z',
    trashedNodeIds: []
  });

  expect(plan.readingQueueNodeIds).toEqual(['reading-early', 'reading-middle', 'reading-late']);
});

it('uses createdAt and the initial interval when reading schedule fields are missing or invalid', () => {
  const source = folder('source-a');
  const invalidInterval = reading('invalid-interval', source.id, '2026-03-20T08:00:00.000Z', -1);
  const missingNextAt = reading('missing-next-at', source.id, '2026-03-01T08:00:00.000Z');
  missingNextAt.reading = missingNextAt.reading ? { ...missingNextAt.reading, nextAt: undefined as unknown as string } : null;
  const nodes = [source, invalidInterval, missingNextAt];

  expect(buildPlan(nodes).readingQueueNodeIds).toEqual(['missing-next-at', 'invalid-interval']);
});

it('uses the next node path when a reading topic moves before the next queue build', () => {
  const sourceA = folder('source-a');
  const sourceB = folder('source-b');
  const moved = reading('moved', sourceA.id);
  const stable = reading('stable', sourceA.id);
  const firstNodes = [sourceA, sourceB, moved, stable];
  const secondNodes = [sourceA, sourceB, { ...moved, parentNodeId: sourceB.id }, stable];

  expect(buildPlan(firstNodes).readingQueueNodeIds).toEqual(['stable', 'moved']);
  expect(buildPlan(secondNodes).readingQueueNodeIds).toEqual(['moved', 'stable']);
});

it('keeps non-active reading states out before material dispersion', () => {
  const source = folder('source-a');
  const nodes = [
    source,
    reading('active', source.id),
    reading('locked', source.id),
    reading('dismissed', source.id),
    reading('done', source.id)
  ];
  nodes[2]!.reading = { ...nodes[2]!.reading!, state: 'locked' };
  nodes[3]!.reading = { ...nodes[3]!.reading!, state: 'dismissed' };
  nodes[4]!.reading = { ...nodes[4]!.reading!, state: 'done' };

  expect(buildPlan(nodes).readingQueueNodeIds).toEqual(['active']);
});

function review(id: string, parentNodeId: string) {
  return {
    ...createReviewNode(id, '2026-03-16T09:00:00.000Z', { lastReviewAt: '2026-03-15T09:00:00.000Z', reps: 2, stability: 1, state: 2 }),
    parentNodeId
  };
}

it('material-disperses due FSRS items by full node path after retrievability ordering', () => {
  const sourceA = folder('source-a');
  const sourceB = folder('source-b');
  const nodes = [
    sourceA,
    sourceB,
    ...Array.from({ length: 19 }, (_, index) => review(`a-${String(index + 1).padStart(2, '0')}`, sourceA.id)),
    review('b-01', sourceB.id)
  ];

  expect(buildPlan(nodes).fsrsQueueNodeIds.slice(0, 4)).toEqual(['a-01', 'b-01', 'a-02', 'a-03']);
});

it('does not material-disperse scheduled FSRS inspection output', () => {
  const sourceA = folder('source-a');
  const sourceB = folder('source-b');
  const nodes = [sourceA, sourceB, review('a-01', sourceA.id), review('a-02', sourceA.id), review('b-01', sourceB.id)];
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({
    includeScheduled: true,
    nodeOrder: nodes.map((node) => node.id),
    nodesById,
    now: '2026-03-21T09:00:00.000Z',
    trashedNodeIds: []
  });

  expect(plan.fsrsQueueNodeIds).toEqual(['a-01', 'a-02', 'b-01']);
});
