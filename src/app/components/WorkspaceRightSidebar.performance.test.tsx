import { waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';

const reviewQueuePanelRender = vi.hoisted(() => vi.fn());

vi.mock('./WorkspaceRightSidebarBacklinksPanel', () => ({
  WorkspaceRightSidebarBacklinksPanel: () => <div />
}));

vi.mock('./WorkspaceRightSidebarDevPanel', () => ({
  WorkspaceRightSidebarDevPanel: () => <div />
}));

vi.mock('./WorkspaceRightSidebarHighlightsPanel', () => ({
  WorkspaceRightSidebarHighlightsPanel: () => <div />
}));

vi.mock('./WorkspaceRightSidebarPerformancePanel', () => ({
  WorkspaceRightSidebarPerformancePanel: () => <div />
}));

vi.mock('./WorkspaceRightSidebarReviewQueuePanel', () => ({
  WorkspaceRightSidebarReviewQueuePanel: (props: unknown) => {
    reviewQueuePanelRender(props);
    return <div data-testid="review-queue-panel" />;
  }
}));

vi.mock('../../features/pdf/model/pdfSystemBridge', () => ({
  requestPdfAnchorJump: vi.fn()
}));

import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';

const STABLE_NOOP = vi.fn();

function createNode(overrides: Partial<Node>): Node {
  return {
    id: overrides.id ?? 'node-1',
    parentNodeId: overrides.parentNodeId ?? null,
    kind: overrides.kind ?? 'topic',
    title: overrides.title ?? 'Node',
    content: overrides.content ?? '',
    anchorLink: overrides.anchorLink ?? null,
    reading: overrides.reading ?? null,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    createdAt: overrides.createdAt ?? '2026-04-05T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-05T00:00:00.000Z'
  };
}

it('does not render the review queue panel before workspace hydration completes', async () => {
    reviewQueuePanelRender.mockClear();
    renderWithLocalization(
      <WorkspaceRightSidebar
        activeNodeId={null}
        activePanelId="review-queue"
        isWorkspaceHydrated={false}
        nodeOrder={[]}
        nodesById={{}}
        onRevealAnchorInDocument={vi.fn()}
        onSelectBreadcrumbNode={STABLE_NOOP}
        onSelectNode={STABLE_NOOP}
        reviewCurrentNodeId={null}
        reviewQueueNodeIds={[]}
        reviewSchedulerSettings={{} as never}
        trashedNodeIds={[]}
      />
    );

    await Promise.resolve();

    expect(reviewQueuePanelRender).not.toHaveBeenCalled();
});

it('keeps review queue panel steady when only queued node content changes', async () => {
    reviewQueuePanelRender.mockClear();
    const queuedNode = createNode({
      id: 'node-1',
      content: 'Version 1',
      title: 'Queued note',
      reading: {
        intervalDurationMs: 86_400_000,
        intervalGrowthFactor: 1.2,
        lastHandledAt: '2026-04-05T00:00:00.000Z',
        nextAt: '2026-04-06T00:00:00.000Z',
        readingPosition: 0,
        repetitionCount: 1
      } as never
    });

    const { rerender } = renderReviewQueueSidebar(queuedNode);

    await waitFor(() => expect(reviewQueuePanelRender).toHaveBeenCalledTimes(1));

    rerender(createReviewQueueSidebarElement(createNode({
      id: 'node-1',
      content: 'Version 2',
      title: 'Queued note',
      reading: {
        intervalDurationMs: 86_400_000,
        intervalGrowthFactor: 1.2,
        lastHandledAt: '2026-04-05T00:00:00.000Z',
        nextAt: '2026-04-06T00:00:00.000Z',
        readingPosition: 0,
        repetitionCount: 1
      } as never
    })));

    expect(reviewQueuePanelRender).toHaveBeenCalledTimes(1);
});

it('rerenders the review queue panel when upcoming flow entries change', async () => {
    reviewQueuePanelRender.mockClear();
    const node = createNode({ id: 'node-1', title: 'Queued note' });
    const { rerender } = renderWithLocalization(
      createReviewQueueSidebarElement(node, createFlowWindow({ queueNodeIds: ['node-1'] }))
    );

    await waitFor(() => expect(reviewQueuePanelRender).toHaveBeenCalledTimes(1));

    rerender(createReviewQueueSidebarElement(node, createFlowWindow({
      dayBuckets: [{ dayOffset: 1, nodeIds: ['node-2'] }],
      queueNodeIds: ['node-1'],
      upcomingNodeIds: ['node-2']
    })));

    await waitFor(() => expect(reviewQueuePanelRender).toHaveBeenCalledTimes(2));
});

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

function createReviewQueueSidebarElement(node: Node, reviewFlowWindow?: ReviewFlowWindow) {
  return (
    <WorkspaceRightSidebar
      activeNodeId="node-1"
      activePanelId="review-queue"
      nodeOrder={['node-1']}
      nodesById={{ 'node-1': node }}
      onRevealAnchorInDocument={vi.fn()}
      onSelectBreadcrumbNode={STABLE_NOOP}
      onSelectNode={STABLE_NOOP}
      reviewCurrentNodeId="node-1"
      {...(reviewFlowWindow ? { reviewFlowWindow } : {})}
      reviewQueueNodeIds={['node-1']}
      reviewSchedulerSettings={{} as never}
      trashedNodeIds={[]}
    />
  );
}

function renderReviewQueueSidebar(node: Node) {
  return renderWithLocalization(createReviewQueueSidebarElement(node));
}
