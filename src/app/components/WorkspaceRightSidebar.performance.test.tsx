import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

const sourcePanelRender = vi.hoisted(() => vi.fn());
const reviewQueuePanelRender = vi.hoisted(() => vi.fn());

vi.mock('./WorkspaceRightSidebarSourcePanel', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    WorkspaceRightSidebarSourcePanel: React.memo((props: unknown) => {
      sourcePanelRender(props);
      return <div data-testid="source-panel" />;
    })
  };
});

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

beforeEach(() => {
  sourcePanelRender.mockClear();
  reviewQueuePanelRender.mockClear();
});

describe('WorkspaceRightSidebar performance', () => {
  it('keeps source info panel steady when only active node content changes', () => {
    const baseNode = createNode({
      id: 'node-1',
      parentNodeId: 'parent-1',
      content: 'Version 1'
    });

    const { rerender } = renderSourceInfoSidebar(baseNode);

    expect(sourcePanelRender).toHaveBeenCalledTimes(1);

    rerender(createSourceInfoSidebarElement(createNode({
      id: 'node-1',
      parentNodeId: 'parent-1',
      content: 'Version 2'
    })));

    expect(sourcePanelRender).toHaveBeenCalledTimes(1);
  });

  it('keeps review queue panel steady when only queued node content changes', () => {
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

    expect(reviewQueuePanelRender).toHaveBeenCalledTimes(1);

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
});

function createSourceInfoSidebarElement(node: Node) {
  return (
    <WorkspaceRightSidebar
      activeNodeId="node-1"
      activePanelId="source-info"
      nodeOrder={['node-1']}
      nodesById={{ 'node-1': node }}
      nodeViewById={{}}
      onRevealAnchorInDocument={vi.fn()}
      onSelectBreadcrumbNode={STABLE_NOOP}
      onSelectNode={vi.fn()}
      reviewCurrentNodeId={null}
      reviewQueueNodeIds={[]}
      reviewSchedulerSettings={{} as never}
      setNodeViewState={vi.fn()}
      trashedNodeIds={[]}
    />
  );
}

function renderSourceInfoSidebar(node: Node) {
  return render(createSourceInfoSidebarElement(node));
}

function createReviewQueueSidebarElement(node: Node) {
  return (
    <WorkspaceRightSidebar
      activeNodeId="node-1"
      activePanelId="review-queue"
      nodeOrder={['node-1']}
      nodesById={{ 'node-1': node }}
      nodeViewById={{}}
      onRevealAnchorInDocument={vi.fn()}
      onSelectBreadcrumbNode={STABLE_NOOP}
      onSelectNode={vi.fn()}
      reviewCurrentNodeId="node-1"
      reviewQueueNodeIds={['node-1']}
      reviewSchedulerSettings={{} as never}
      setNodeViewState={vi.fn()}
      trashedNodeIds={[]}
    />
  );
}

function renderReviewQueueSidebar(node: Node) {
  return render(createReviewQueueSidebarElement(node));
}
