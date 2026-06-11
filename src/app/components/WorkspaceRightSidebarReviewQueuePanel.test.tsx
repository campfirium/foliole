import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { inspectorListInsetClassName, inspectorListInsetPaddingClassName } from '../../shared/ui';

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

  renderWithLocalization(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId="reading-now"
      flowWindow={{ queueNodeIds: ['fsrs-later', 'reading-now'], readyNodeIds: [], upcomingNodeIds: [] }}
      nodesById={nodesById}
      onSelectNode={() => undefined}
    />
  );

  const items = within(screen.getByRole('list', { name: 'Flow items' })).getAllByRole('listitem');

  expect(screen.queryByText('Queue')).not.toBeInTheDocument();
  expect(screen.queryByText(/items ·/)).not.toBeInTheDocument();
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

  renderWithLocalization(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId="reading-1"
      flowWindow={{
        queueNodeIds: [
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
        ],
        readyNodeIds: [],
        upcomingNodeIds: []
      }}
      nodesById={nodesById}
      onSelectNode={() => undefined}
    />
  );

  const items = within(screen.getByRole('list', { name: 'Flow items' })).getAllByRole('listitem');

  expect(items[0]!).toHaveTextContent('1Reading 1');
  expect(items[6]!).toHaveTextContent('7Reading 2');
});

it('shows an error when the review queue references an unavailable topic', () => {
  renderWithLocalization(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId={null}
      flowWindow={{ queueNodeIds: ['missing-topic'], readyNodeIds: [], upcomingNodeIds: [] }}
      nodesById={{}}
      onSelectNode={() => undefined}
    />
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Flow has an unavailable topic');
  expect(screen.queryByText('Missing topic')).not.toBeInTheDocument();
});

it('opens the queued node from the title only', () => {
  const onSelectNode = vi.fn();

  renderWithLocalization(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId={null}
      flowWindow={{ queueNodeIds: ['reading-1'], readyNodeIds: [], upcomingNodeIds: [] }}
      nodesById={{
        'reading-1': createNode({ id: 'reading-1', title: 'Reading 1' })
      }}
      onSelectNode={onSelectNode}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Reading 1' }));

  expect(onSelectNode).toHaveBeenCalledWith('reading-1');
  expect(screen.getByRole('button', { name: 'Reading 1' }).className).toContain('focus:outline-none');
  expect(screen.getByRole('button', { name: 'Reading 1' }).className).toContain('focus-visible:ring-1');
});

it('does not show due times in the flow list', () => {
  renderWithLocalization(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId={null}
      flowWindow={{ queueNodeIds: ['reading-1', 'fsrs-1'], readyNodeIds: [], upcomingNodeIds: [] }}
      nodesById={{
        'reading-1': createNode({
          id: 'reading-1',
          reading: {
            intervalDurationMs: 86_400_000,
            intervalGrowthFactor: 1.2,
            lastHandledAt: '2026-05-26T00:00:00.000Z',
            nextAt: '2026-05-27T09:46:00.000Z',
            readingPosition: 0,
            repetitionCount: 1,
            state: 'active'
          } as never,
          title: 'Reading 1'
        }),
        'fsrs-1': createNode({
          id: 'fsrs-1',
          kind: 'item',
          review: { due: '2026-05-26T09:24:00.000Z', state: 2 } as never,
          title: 'FSRS 1'
        })
      }}
      onSelectNode={() => undefined}
    />
  );

  expect(screen.queryByText(/05\/27/)).not.toBeInTheDocument();
  expect(screen.queryByText(/05\/26/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reading 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'FSRS 1' })).toBeInTheDocument();
});

it('separates queue and ready flow entries with dividers only', () => {
  renderWithLocalization(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId="reading-1"
      flowWindow={{ queueNodeIds: ['reading-1'], readyNodeIds: ['reading-2'], upcomingNodeIds: [] }}
      nodesById={{
        'reading-1': createNode({ id: 'reading-1', title: 'Reading 1' }),
        'reading-2': createNode({ id: 'reading-2', title: 'Reading 2' })
      }}
      onSelectNode={() => undefined}
    />
  );

  const items = within(screen.getByRole('list', { name: 'Flow items' })).getAllByRole('listitem');

  expect(screen.getByText('Flow')).toBeInTheDocument();
  expect(screen.getByText('Flow').closest('header')).toHaveClass(inspectorListInsetPaddingClassName);
  expect(screen.queryByText('Queue')).not.toBeInTheDocument();
  expect(screen.queryByText('Ready now')).not.toBeInTheDocument();
  expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
  expect(screen.getAllByRole('presentation')).toHaveLength(1);
  expect(screen.getAllByRole('presentation')[0]).toHaveClass(inspectorListInsetClassName);
  expect(items[0]!).toHaveClass(inspectorListInsetPaddingClassName);
  expect(items[0]!).toHaveTextContent('1Reading 1');
  expect(items[1]!).toHaveTextContent('2Reading 2');
});

it('treats future-only flow content as empty', () => {
  renderWithLocalization(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId={null}
      flowWindow={{ queueNodeIds: [], readyNodeIds: [], upcomingNodeIds: ['reading-later'] }}
      nodesById={{
        'reading-later': createNode({ id: 'reading-later', title: 'Reading Later' })
      }}
      onSelectNode={() => undefined}
    />
  );

  expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reading Later' })).not.toBeInTheDocument();
  expect(screen.getByText('No Flow topics are available right now.')).toBeInTheDocument();
});
