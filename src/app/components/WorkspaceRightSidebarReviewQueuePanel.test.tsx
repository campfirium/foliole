import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { WorkspaceRightSidebarReviewQueuePanel } from './WorkspaceRightSidebarReviewQueuePanel';

function createNode(overrides: Partial<Node>): Node {
  return {
    id: overrides.id ?? 'node-1',
    parentNodeId: overrides.parentNodeId ?? null,
    kind: overrides.kind ?? 'topic',
    title: overrides.title ?? 'Node',
    content: overrides.content ?? 'Body',
    anchorLink: overrides.anchorLink ?? null,
    reading: overrides.reading ?? null,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    createdAt: overrides.createdAt ?? '2026-04-05T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-05T00:00:00.000Z'
  };
}

it('shows the current actionable item first even when the whole queue starts with scheduled FSRS items', () => {
  const nodesById = {
    'fsrs-later': createNode({
      id: 'fsrs-later',
      kind: 'item',
      review: {
        due: '2026-04-25T00:00:00.000Z',
        state: 2
      } as never,
      title: 'Scheduled FSRS'
    }),
    'reading-now': createNode({
      id: 'reading-now',
      reading: {
        intervalDurationMs: 86_400_000,
        intervalGrowthFactor: 1.2,
        lastHandledAt: '2026-04-20T00:00:00.000Z',
        nextAt: '2026-04-21T00:00:00.000Z',
        readingPosition: 0,
        repetitionCount: 1,
        state: 'active'
      } as never,
      title: 'Reading Now'
    })
  };

  render(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId="reading-now"
      nodesById={nodesById}
      queueNodeIds={['fsrs-later', 'reading-now']}
    />
  );

  const items = within(screen.getByRole('list', { name: 'Review queue items' })).getAllByRole('listitem');

  expect(within(items[0]!).getByText(/1\. Reading Now/)).toBeInTheDocument();
  expect(within(items[0]!).getByText('Current')).toBeInTheDocument();
  expect(within(items[1]!).getByText(/2\. Scheduled FSRS/)).toBeInTheDocument();
});

it('keeps the mixed queue cadence after the current reading item', () => {
  const nodesById = Object.fromEntries([
    ['reading-1', createNode({ id: 'reading-1', title: 'Reading 1' })],
    ['reading-2', createNode({ id: 'reading-2', title: 'Reading 2' })],
    ...Array.from({ length: 10 }, (_, index) => {
      const id = `fsrs-${index + 1}`;
      return [
        id,
        createNode({
          id,
          kind: 'item',
          review: { due: '2026-04-25T00:00:00.000Z', state: 2 } as never,
          title: `FSRS ${index + 1}`
        })
      ] as const;
    })
  ]);

  render(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId="reading-1"
      nodesById={nodesById}
      queueNodeIds={[
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
        'reading-2'
      ]}
    />
  );

  const items = within(screen.getByRole('list', { name: 'Review queue items' })).getAllByRole('listitem');

  expect(within(items[0]!).getByText(/1\. Reading 1/)).toBeInTheDocument();
  expect(within(items[6]!).getByText(/7\. Reading 2/)).toBeInTheDocument();
});

it('shows an error when the review queue references an unavailable topic', () => {
  render(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId={null}
      nodesById={{}}
      queueNodeIds={['missing-topic']}
    />
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Review queue has an unavailable topic');
  expect(screen.queryByText('Missing topic')).not.toBeInTheDocument();
});
