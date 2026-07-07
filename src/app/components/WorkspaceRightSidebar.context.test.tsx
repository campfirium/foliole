import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import {
  isWorkspaceRightPanelAvailable,
  resolveWorkspaceRightPanelContext
} from './workspaceRightPanelAvailability';
import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

function createNode(overrides: Partial<Node>): Node {
  return {
    id: overrides.id ?? 'node-1',
    parentNodeId: overrides.parentNodeId ?? null,
    kind: overrides.kind ?? 'topic',
    title: overrides.title ?? 'Topic',
    content: overrides.content ?? '',
    anchorLink: overrides.anchorLink ?? null,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z'
  };
}

function renderRightSidebar(args: {
  activeNodeId: string | null;
  activePanelId: WorkspaceRightPanelId;
  nodesById: Record<string, Node>;
  nodeOrder: string[];
  outlineDocument?: {
    activePosition: number;
    content: string;
    onRevealPosition: (position: number) => void;
  };
}) {
  render(
    <WorkspaceRightSidebar
      activeNodeId={args.activeNodeId}
      activePanelId={args.activePanelId}
      nodeOrder={args.nodeOrder}
      nodesById={args.nodesById}
      onRevealAnchorInDocument={vi.fn()}
      onSelectBreadcrumbNode={vi.fn()}
      onSelectNode={vi.fn()}
      reviewCurrentNodeId={null}
      reviewQueueNodeIds={[]}
      reviewSchedulerSettings={{} as never}
      trashedNodeIds={[]}
      {...(args.outlineDocument ? { outlineDocument: args.outlineDocument } : {})}
    />
  );
}

it('keeps external documents from reusing the previous topic highlights', () => {
  const parent = createNode({ content: 'Alpha Beta', id: 'topic-1' });
  const highlight = createNode({
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    },
    content: 'Beta',
    id: 'highlight-1',
    parentNodeId: 'topic-1'
  });

  renderRightSidebar({
    activeNodeId: 'topic-1',
    activePanelId: 'highlights',
    nodeOrder: ['topic-1', 'highlight-1'],
    nodesById: { 'highlight-1': highlight, 'topic-1': parent },
    outlineDocument: {
      activePosition: 0,
      content: '# External document',
      onRevealPosition: vi.fn()
    }
  });

  expect(screen.queryByText('Highlights')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Beta' })).not.toBeInTheDocument();
});

it('does not aggregate highlights for folder selections', () => {
  const folder = createNode({ id: 'folder-1', kind: 'folder', title: 'Folder' });
  const topic = createNode({ content: 'Alpha Beta', id: 'topic-1', parentNodeId: 'folder-1' });
  const highlight = createNode({
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    },
    content: 'Beta',
    id: 'highlight-1',
    parentNodeId: 'topic-1'
  });

  renderRightSidebar({
    activeNodeId: 'folder-1',
    activePanelId: 'highlights',
    nodeOrder: ['folder-1', 'topic-1', 'highlight-1'],
    nodesById: { 'folder-1': folder, 'highlight-1': highlight, 'topic-1': topic }
  });

  expect(screen.queryByText('Highlights')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Beta' })).not.toBeInTheDocument();
});

it('does not use a derived highlight topic as a highlight browsing scope', () => {
  const parent = createNode({ content: 'Alpha Beta', id: 'topic-1' });
  const highlight = createNode({
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    },
    content: 'Beta',
    id: 'highlight-1',
    parentNodeId: 'topic-1'
  });

  renderRightSidebar({
    activeNodeId: 'highlight-1',
    activePanelId: 'highlights',
    nodeOrder: ['topic-1', 'highlight-1'],
    nodesById: { 'highlight-1': highlight, 'topic-1': parent }
  });

  expect(screen.queryByText('Highlights')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Beta' })).not.toBeInTheDocument();
});

it('keeps only external-document safe panels available for external documents', () => {
  const context = resolveWorkspaceRightPanelContext({
    activeNodeId: 'topic-1',
    hasExternalDocument: true,
    nodesById: { 'topic-1': createNode({ id: 'topic-1' }) }
  });

  expect(isWorkspaceRightPanelAvailable('outline', context)).toBe(true);
  expect(isWorkspaceRightPanelAvailable('assistant', context)).toBe(true);
  expect(isWorkspaceRightPanelAvailable('performance', context)).toBe(true);
  expect(isWorkspaceRightPanelAvailable('highlights', context)).toBe(false);
  expect(isWorkspaceRightPanelAvailable('review-queue', context)).toBe(false);
});
