import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';

const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;
const RELEASE_GATE_WAIT_OPTIONS = { timeout: RELEASE_GATE_TEST_TIMEOUT_MS };

const { requestPdfAnchorJump } = vi.hoisted(() => ({
  requestPdfAnchorJump: vi.fn()
}));
const { loadRuntimeNodeSourceDetails } = vi.hoisted(() => ({
  loadRuntimeNodeSourceDetails: vi.fn()
}));

vi.mock('../../features/pdf/model/pdfSystemBridge', () => ({
  requestPdfAnchorJump
}));

vi.mock('../../shared/platform/nodeSourceBridge', () => ({
  loadRuntimeNodeSourceDetails
}));

beforeEach(() => {
  vi.clearAllMocks();
  loadRuntimeNodeSourceDetails.mockResolvedValue(null);
});

function createNode(overrides: Partial<Node>): Node {
  return {
    id: overrides.id ?? 'node-1',
    parentNodeId: overrides.parentNodeId ?? null,
    kind: overrides.kind ?? 'topic',
    title: overrides.title ?? 'Node',
    content: overrides.content ?? '',
    anchorLink: overrides.anchorLink ?? null,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    createdAt: overrides.createdAt ?? '2026-04-05T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-05T00:00:00.000Z'
  };
}

it('opens pdf highlight parent through unified node selection when parent is not active yet', async () => {
  const onSelectNode = vi.fn();
  const onRevealAnchorInDocument = vi.fn();

  const parentNode = createNode({
    id: 'node-parent',
    content: 'Parent content',
    title: 'Parent',
    parentNodeId: 'node-root'
  });
  const rootNode = createNode({
    id: 'node-root',
    content: 'Root content',
    title: 'Root'
  });
  const highlightNode = createNode({
    anchorLink: { id: 'pdf-hl-1', kind: 'highlight', locator: { page: 4, x: 0.3, y: 0.6 } },
    content: 'Picked text',
    id: 'node-highlight',
    parentNodeId: 'node-parent',
    title: 'Highlight'
  });

  renderWithLocalization(
    <WorkspaceRightSidebar
      activeNodeId="node-root"
      activePanelId="highlights"
      nodeOrder={['node-root', 'node-parent', 'node-highlight']}
      nodesById={{ 'node-highlight': highlightNode, 'node-parent': parentNode, 'node-root': rootNode }}
      onRevealAnchorInDocument={onRevealAnchorInDocument}
      onSelectBreadcrumbNode={vi.fn()}
      onSelectNode={onSelectNode}
      reviewCurrentNodeId={null}
      reviewQueueNodeIds={[]}
      reviewSchedulerSettings={{} as never}
      trashedNodeIds={[]}
    />
  );

  fireEvent.click(await screen.findByRole('button', { name: /picked text/i }, RELEASE_GATE_WAIT_OPTIONS));

  expect(onSelectNode).toHaveBeenCalledWith(
    'node-parent',
    expect.objectContaining({ id: 'pdf-hl-1', kind: 'highlight', locator: { page: 4, x: 0.3, y: 0.6 } })
  );
  expect(onRevealAnchorInDocument).not.toHaveBeenCalled();
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
});

it('opens parent node with text highlight focus when highlight parent is not active yet', async () => {
  const onSelectNode = vi.fn();
  const onRevealAnchorInDocument = vi.fn();

  const rootNode = createNode({
    id: 'node-root',
    content: 'Root content',
    title: 'Root'
  });
  const parentNode = createNode({
    id: 'node-parent',
    content: 'Alpha Beta Gamma',
    title: 'Parent',
    parentNodeId: 'node-root'
  });
  const highlightNode = createNode({
    anchorLink: {
      id: 'text-hl-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    },
    content: 'Beta',
    id: 'node-highlight',
    parentNodeId: 'node-parent',
    title: 'Highlight'
  });

  renderWithLocalization(
    <WorkspaceRightSidebar
      activeNodeId="node-root"
      activePanelId="highlights"
      nodeOrder={['node-root', 'node-parent', 'node-highlight']}
      nodesById={{ 'node-highlight': highlightNode, 'node-parent': parentNode, 'node-root': rootNode }}
      onRevealAnchorInDocument={onRevealAnchorInDocument}
      onSelectBreadcrumbNode={vi.fn()}
      onSelectNode={onSelectNode}
      reviewCurrentNodeId={null}
      reviewQueueNodeIds={[]}
      reviewSchedulerSettings={{} as never}
      trashedNodeIds={[]}
    />
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Beta' }, RELEASE_GATE_WAIT_OPTIONS));

  expect(onSelectNode).toHaveBeenCalledWith(
    'node-parent',
    expect.objectContaining({
      id: 'text-hl-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    })
  );
  expect(onRevealAnchorInDocument).not.toHaveBeenCalled();
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
});


it('routes current-parent pdf highlights through unified node selection without reopening', async () => {
  const onSelectNode = vi.fn();
  const onRevealAnchorInDocument = vi.fn();

  const parentNode = createNode({
    id: 'node-parent',
    content: 'Parent content',
    title: 'Parent'
  });
  const highlightNode = createNode({
    anchorLink: { id: 'pdf-hl-1', kind: 'highlight', locator: { page: 4, x: 0.3, y: 0.6 } },
    content: 'Picked text',
    id: 'node-highlight',
    parentNodeId: 'node-parent',
    title: 'Highlight'
  });

  renderWithLocalization(
    <WorkspaceRightSidebar
      activeNodeId="node-parent"
      activePanelId="highlights"
      nodeOrder={['node-parent', 'node-highlight']}
      nodesById={{ 'node-highlight': highlightNode, 'node-parent': parentNode }}
      onRevealAnchorInDocument={onRevealAnchorInDocument}
      onSelectBreadcrumbNode={vi.fn()}
      onSelectNode={onSelectNode}
      reviewCurrentNodeId={null}
      reviewQueueNodeIds={[]}
      reviewSchedulerSettings={{} as never}
      trashedNodeIds={[]}
    />
  );

  fireEvent.click(await screen.findByRole('button', { name: /picked text/i }, RELEASE_GATE_WAIT_OPTIONS));

  expect(onSelectNode).toHaveBeenCalledWith(
    'node-parent',
    expect.objectContaining({ id: 'pdf-hl-1', kind: 'highlight', locator: { page: 4, x: 0.3, y: 0.6 } })
  );
  expect(onRevealAnchorInDocument).not.toHaveBeenCalled();
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
});

it('routes current-parent text highlights through unified node selection without reopening another note', async () => {
  const onSelectNode = vi.fn();
  const onRevealAnchorInDocument = vi.fn();

  const parentNode = createNode({
    id: 'node-parent',
    content: 'Alpha Beta Gamma',
    title: 'Parent'
  });
  const highlightNode = createNode({
    anchorLink: {
      id: 'text-hl-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    },
    content: 'Beta',
    id: 'node-highlight',
    parentNodeId: 'node-parent',
    title: 'Highlight'
  });

  renderWithLocalization(
    <WorkspaceRightSidebar
      activeNodeId="node-parent"
      activePanelId="highlights"
      nodeOrder={['node-parent', 'node-highlight']}
      nodesById={{ 'node-highlight': highlightNode, 'node-parent': parentNode }}
      onRevealAnchorInDocument={onRevealAnchorInDocument}
      onSelectBreadcrumbNode={vi.fn()}
      onSelectNode={onSelectNode}
      reviewCurrentNodeId={null}
      reviewQueueNodeIds={[]}
      reviewSchedulerSettings={{} as never}
      trashedNodeIds={[]}
    />
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Beta' }, RELEASE_GATE_WAIT_OPTIONS));

  expect(onSelectNode).toHaveBeenCalledWith(
    'node-parent',
    expect.objectContaining({
      id: 'text-hl-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    })
  );
  expect(onRevealAnchorInDocument).not.toHaveBeenCalled();
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
});

it('renders the outline panel from active topic headings', async () => {
  const onRevealDocumentPosition = vi.fn();
  const activeNode = createNode({
    content: '# Title\n\n## First section\n\nText\n\n### Detail',
    id: 'node-topic',
    title: 'Topic'
  });

  renderWithLocalization(
    <WorkspaceRightSidebar
      activeNodeId="node-topic"
      activePanelId="outline"
      outlineActivePosition={activeNode.content.indexOf('Detail')}
      nodeOrder={['node-topic']}
      nodesById={{ 'node-topic': activeNode }}
      onRevealAnchorInDocument={vi.fn()}
      onRevealDocumentPosition={onRevealDocumentPosition}
      onSelectBreadcrumbNode={vi.fn()}
      onSelectNode={vi.fn()}
      reviewCurrentNodeId={null}
      reviewQueueNodeIds={[]}
      reviewSchedulerSettings={{} as never}
      trashedNodeIds={[]}
    />
  );

  fireEvent.click(await screen.findByRole('button', { name: /first section/i }, RELEASE_GATE_WAIT_OPTIONS));

  expect(screen.getByRole('navigation', { name: 'Document outline' })).toBeInTheDocument();
  expect(screen.queryByText('Outline')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /detail/i })).toHaveAttribute('aria-current', 'location');
  expect(screen.getByRole('button', { name: /detail/i })).toHaveClass('font-normal');
  expect(onRevealDocumentPosition).toHaveBeenCalledWith(activeNode.content.indexOf('First section'));
});
