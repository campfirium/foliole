import { screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { installDemoRuntimeController, type DemoRuntimeController } from '../../shared/platform/runtime/demoRuntime';
import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';

import { WorkspaceRightSidebarReviewQueuePanel } from './WorkspaceRightSidebarReviewQueuePanel';

function createFlowWindow(overrides: Partial<ReviewFlowWindow>): ReviewFlowWindow {
  return {
    dayBuckets: [],
    dayOffsetByNodeId: {},
    queueNodeIds: [],
    readyNodeIds: [],
    upcomingNodeIds: [],
    ...overrides
  };
}

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

function installDemoRuntime(isDemo: boolean, previewDay = 0) {
  const state = {
    clearError: null,
    importError: null,
    importedTopicCount: 0,
    isDemo,
    manualAdvanceDays: 0,
    previewDay,
    startedAt: null
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
      flowWindow={createFlowWindow({
        dayBuckets: [{ dayOffset: 1, nodeIds: ['reading-later'] }],
        upcomingNodeIds: ['reading-later']
      })}
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
      flowWindow={createFlowWindow({
        dayBuckets: [
          { dayOffset: 1, nodeIds: ['day-1'] },
          { dayOffset: 2, nodeIds: ['day-2'] }
        ],
        dayOffsetByNodeId: {
          'day-1': 1,
          'day-2': 2
        },
        upcomingNodeIds: ['day-1', 'day-2']
      })}
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
  expect(screen.getByRole('button', { name: 'Day One Topic' }).closest('li')).toHaveTextContent(/^1Day One Topic$/);
  expect(screen.getByRole('button', { name: 'Day Two Topic' }).closest('li')).toHaveTextContent(/^1Day Two Topic$/);
});

it('groups the current Demo Flow entries under Day 1', () => {
  installDemoRuntime(true);

  renderWithLocalization(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId={null}
      flowWindow={createFlowWindow({
        dayBuckets: [{ dayOffset: 1, nodeIds: ['future'] }],
        dayOffsetByNodeId: {
          current: 0,
          future: 1
        },
        queueNodeIds: ['current'],
        upcomingNodeIds: ['future']
      })}
      nodesById={{
        current: createNode({ id: 'current', title: 'Current Topic' }),
        future: createNode({ id: 'future', title: 'Future Topic' })
      }}
      onSelectNode={() => undefined}
    />
  );

  const dayOneLabels = screen.getAllByText('Day 1');
  expect(dayOneLabels).toHaveLength(2);
  expect(screen.getByText('Day 2')).toBeInTheDocument();
  expect(dayOneLabels.some((label) => label.closest('li')?.className.includes('px-inspector-list-inset'))).toBe(true);
  expect(dayOneLabels.some((label) => label.closest('li')?.className.includes('pt-0'))).toBe(true);
  expect(screen.getByText('Flow')).toHaveClass('whitespace-nowrap');
  expect(screen.getByText('Flow').parentElement).toHaveClass('justify-between');
  expect(screen.getByRole('button', { name: 'Current Topic' })).toHaveClass('text-left');
  expect(screen.getByRole('button', { name: 'Current Topic' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Future Topic' })).toBeInTheDocument();
});

it('keeps Demo day identity stable after the preview day advances', () => {
  installDemoRuntime(true, 1);

  renderWithLocalization(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId={null}
      flowWindow={createFlowWindow({
        dayOffsetByNodeId: {
          'day-2-ready': 0,
          'day-3-ready': 1
        },
        readyNodeIds: ['day-2-ready', 'day-3-ready']
      })}
      nodesById={{
        'day-2-ready': createNode({ id: 'day-2-ready', title: 'Day Two Ready' }),
        'day-3-ready': createNode({ id: 'day-3-ready', title: 'Day Three Ready' })
      }}
      onSelectNode={() => undefined}
    />
  );

  const dayTwoLabels = screen.getAllByText('Day 2');
  expect(dayTwoLabels).toHaveLength(2);
  expect(screen.getByText('Day 3')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Day Two Ready' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Day Three Ready' })).toBeInTheDocument();
});
