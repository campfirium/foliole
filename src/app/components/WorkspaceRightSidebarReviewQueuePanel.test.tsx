import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

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
      onSelectNode={() => undefined}
      queueNodeIds={['fsrs-later', 'reading-now']}
    />
  );

  const items = within(screen.getByRole('list', { name: 'Review flow items' })).getAllByRole('listitem');

  expect(items[0]!).toHaveTextContent('1Reading Now');
  expect(items[1]!).toHaveTextContent('2Scheduled FSRS');
  expect(screen.queryByText('Current')).not.toBeInTheDocument();
  expect(screen.queryByText('Queued')).not.toBeInTheDocument();
  expect(screen.queryByText(/Scheduled ·/)).not.toBeInTheDocument();
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
      onSelectNode={() => undefined}
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

  const items = within(screen.getByRole('list', { name: 'Review flow items' })).getAllByRole('listitem');

  expect(items[0]!).toHaveTextContent('1Reading 1');
  expect(items[6]!).toHaveTextContent('7Reading 2');
});

it('shows an error when the review queue references an unavailable topic', () => {
  render(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId={null}
      nodesById={{}}
      onSelectNode={() => undefined}
      queueNodeIds={['missing-topic']}
    />
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Flow has an unavailable topic');
  expect(screen.queryByText('Missing topic')).not.toBeInTheDocument();
});

it('opens the queued node from the title only', () => {
  const onSelectNode = vi.fn();

  render(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId={null}
      nodesById={{
        'reading-1': createNode({ id: 'reading-1', title: 'Reading 1' })
      }}
      onSelectNode={onSelectNode}
      queueNodeIds={['reading-1']}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Reading 1' }));

  expect(onSelectNode).toHaveBeenCalledWith('reading-1');
});

it('separates the active queue from later flow entries', () => {
  render(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId="reading-1"
      flowNodeIds={['reading-1', 'reading-2', 'reading-3']}
      nodesById={{
        'reading-1': createNode({ id: 'reading-1', title: 'Reading 1' }),
        'reading-2': createNode({ id: 'reading-2', title: 'Reading 2' }),
        'reading-3': createNode({ id: 'reading-3', title: 'Reading 3' })
      }}
      onSelectNode={() => undefined}
      queueNodeIds={['reading-1']}
    />
  );

  const items = within(screen.getByRole('list', { name: 'Review flow items' })).getAllByRole('listitem');

  expect(screen.getByText('Flow')).toBeInTheDocument();
  expect(screen.getByRole('presentation')).toHaveClass('bg-border/45');
  expect(items[0]!).toHaveTextContent('1Reading 1');
  expect(items[1]!).toHaveTextContent('2Reading 2');
  expect(items[2]!).toHaveTextContent('3Reading 3');
});
