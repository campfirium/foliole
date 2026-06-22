import { screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { installDemoRuntimeController, type DemoRuntimeController } from '../../shared/platform/runtime/demoRuntime';

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

function installDemoRuntime(isDemo: boolean) {
  const state = {
    clearError: null,
    importError: null,
    importedTopicCount: 0,
    isDemo,
    previewDay: 0
  };
  installDemoRuntimeController({
    clearLocalData: () => Promise.resolve(false),
    continueToNextPreviewDay: () => undefined,
    getNowIso: (realNow) => realNow.toISOString(),
    getState: () => state,
    importMarkdown: () => Promise.resolve({ ignoredCount: 0, importedTopicCount: 0 }),
    subscribe: () => () => undefined
  } satisfies DemoRuntimeController);
}

beforeEach(() => {
  installDemoRuntime(false);
});

it('keeps Demo controls out of the Flow queue panel surface', () => {
  renderWithLocalization(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId={null}
      flowWindow={{ dayBuckets: [{ dayOffset: 1, nodeIds: ['reading-later'] }], queueNodeIds: [], readyNodeIds: [], upcomingNodeIds: ['reading-later'] }}
      nodesById={{
        'reading-later': createNode({ id: 'reading-later', title: 'Reading Later' })
      }}
      onSelectNode={() => undefined}
    />
  );

  expect(screen.queryByRole('region', { name: 'Demo controls' })).toBeNull();
  expect(screen.queryByText('Clear local data')).toBeNull();
});

it('shows Demo future Flow entries as preview day groups', () => {
  installDemoRuntime(true);

  renderWithLocalization(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId={null}
      flowWindow={{
        dayBuckets: [
          { dayOffset: 1, nodeIds: ['day-1'] },
          { dayOffset: 2, nodeIds: ['day-2'] }
        ],
        queueNodeIds: [],
        readyNodeIds: [],
        upcomingNodeIds: ['day-1', 'day-2']
      }}
      nodesById={{
        'day-1': createNode({ id: 'day-1', title: 'Day One Topic' }),
        'day-2': createNode({ id: 'day-2', title: 'Day Two Topic' })
      }}
      onSelectNode={() => undefined}
    />
  );

  expect(screen.getByText('Day 2')).toBeInTheDocument();
  expect(screen.getByText('Day 3')).toBeInTheDocument();
  expect(screen.queryByText('Scheduled later')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Day One Topic' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Day Two Topic' })).toBeInTheDocument();
});

it('groups the current Demo Flow entries under Day 1', () => {
  installDemoRuntime(true);

  renderWithLocalization(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId={null}
      flowWindow={{
        dayBuckets: [{ dayOffset: 1, nodeIds: ['future'] }],
        queueNodeIds: ['current'],
        readyNodeIds: [],
        upcomingNodeIds: ['future']
      }}
      nodesById={{
        current: createNode({ id: 'current', title: 'Current Topic' }),
        future: createNode({ id: 'future', title: 'Future Topic' })
      }}
      onSelectNode={() => undefined}
    />
  );

  expect(screen.getByText('Day 1')).toBeInTheDocument();
  expect(screen.getByText('Day 2')).toBeInTheDocument();
  expect(screen.getByText('Day 1').closest('li')).toHaveClass('text-center');
  expect(screen.getByRole('button', { name: 'Current Topic' })).toHaveClass('text-left');
  expect(screen.getByRole('button', { name: 'Current Topic' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Future Topic' })).toBeInTheDocument();
});
