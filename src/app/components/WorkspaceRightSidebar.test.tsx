import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';

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

it('queues pdf jump for parent node when highlight parent is not active yet', () => {
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

  render(
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

  fireEvent.click(screen.getByRole('button', { name: /picked text/i }));

  expect(onSelectNode).toHaveBeenCalledWith('node-parent');
  expect(onRevealAnchorInDocument).not.toHaveBeenCalled();
  expect(requestPdfAnchorJump).toHaveBeenCalledWith('node-parent', { page: 4, x: 0.3, y: 0.6 });
});

it('opens parent node with text highlight focus when highlight parent is not active yet', () => {
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

  render(
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

  fireEvent.click(screen.getByRole('button', { name: /highlight beta/i }));

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

it('does not list cloze nodes in the highlights panel', () => {
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
  const clozeNode = createNode({
    anchorLink: {
      id: 'text-cloze-1',
      kind: 'cloze',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    },
    content: 'Alpha [...] Gamma',
    reveal: 'Beta',
    id: 'node-cloze',
    parentNodeId: 'node-parent',
    title: 'Cloze'
  });

  render(
    <WorkspaceRightSidebar
      activeNodeId="node-root"
      activePanelId="highlights"
      nodeOrder={['node-root', 'node-parent', 'node-cloze']}
      nodesById={{ 'node-cloze': clozeNode, 'node-parent': parentNode, 'node-root': rootNode }}
      onRevealAnchorInDocument={onRevealAnchorInDocument}
      onSelectBreadcrumbNode={vi.fn()}
      onSelectNode={onSelectNode}
      reviewCurrentNodeId={null}
      reviewQueueNodeIds={[]}
      reviewSchedulerSettings={{} as never}
      trashedNodeIds={[]}
    />
  );

  expect(screen.getByText('This node and its child nodes have no highlight nodes yet.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Alpha \[\.\.\.\] Gamma/i })).not.toBeInTheDocument();
  expect(onSelectNode).not.toHaveBeenCalled();
  expect(onRevealAnchorInDocument).not.toHaveBeenCalled();
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
});

it('reveals pdf locator without re-opening when parent document is already active', () => {
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

  render(
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

  fireEvent.click(screen.getByRole('button', { name: /picked text/i }));

  expect(onSelectNode).not.toHaveBeenCalled();
  expect(onRevealAnchorInDocument).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'pdf-hl-1', kind: 'highlight', locator: { page: 4, x: 0.3, y: 0.6 } })
  );
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
});

it('reveals text highlight within the current parent document without switching nodes', () => {
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

  render(
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

  fireEvent.click(screen.getByRole('button', { name: /highlight beta/i }));

  expect(onSelectNode).not.toHaveBeenCalled();
  expect(onRevealAnchorInDocument).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'text-hl-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    })
  );
  expect(requestPdfAnchorJump).not.toHaveBeenCalled();
});

it('renders backlinks in the dedicated inspector panel and opens the linked note', () => {
  const onSelectNode = vi.fn();

  render(
    <WorkspaceRightSidebar
      activeNodeId="target"
      activePanelId="backlinks"
      nodeOrder={['target', 'source']}
      nodesById={{
        source: createNode({
          id: 'source',
          title: 'Source note',
          content: 'Before\nSee [[Target note]] for details.\nAfter'
        }),
        target: createNode({
          id: 'target',
          title: 'Target note',
          content: 'Current node'
        })
      }}
      onRevealAnchorInDocument={vi.fn()}
      onSelectBreadcrumbNode={vi.fn()}
      onSelectNode={onSelectNode}
      reviewCurrentNodeId={null}
      reviewQueueNodeIds={[]}
      reviewSchedulerSettings={{} as never}
      trashedNodeIds={[]}
    />
  );

  expect(screen.getByRole('heading', { level: 3, name: 'Backlinks' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /source note/i }));

  expect(onSelectNode).toHaveBeenCalledWith('source');
});

it('shows inherited source info without a parent-jump action', async () => {
  const onSelectNode = vi.fn();
  loadRuntimeNodeSourceDetails.mockResolvedValue({
    importRuns: [
      {
        contentFingerprint: 'content-1',
        degradedReason: null,
        duplicateSemantic: 'new',
        failureReason: null,
        importId: 'import-1',
        importedAt: '2026-04-16T00:00:00.000Z',
        nodeId: 'parent-node',
        provider: 'desktop_text_file',
        resultStatus: 'imported',
        sourceFingerprint: 'source-1',
        sourceKind: 'markdown',
        sourceLocator: '/tmp/parent.md',
        sourceName: 'parent.md'
      }
    ],
    importSource: {
      firstImportedAt: '2026-04-15T00:00:00.000Z',
      lastContentFingerprint: 'content-1',
      lastImportedAt: '2026-04-16T00:00:00.000Z',
      latestNodeId: 'parent-node',
      provider: 'desktop_text_file',
      sourceFingerprint: 'source-1',
      sourceKind: 'markdown',
      sourceLocator: '/tmp/parent.md',
      sourceName: 'parent.md'
    },
    inheritedFromParent: true,
    keepImportItem: null,
    pdfPageDimensions: [],
    sourceNodeId: 'parent-node'
  });

  render(
    <WorkspaceRightSidebar
      activeNodeId="child-node"
      activePanelId="source-info"
      nodeOrder={['parent-node', 'child-node']}
      nodesById={{
        'child-node': createNode({
          id: 'child-node',
          anchorLink: {
            id: 'text-hl-1',
            kind: 'highlight',
            locator: { from: 6, originalText: 'Beta', to: 10 }
          },
          parentNodeId: 'parent-node',
          title: 'Child'
        }),
        'parent-node': createNode({
          id: 'parent-node',
          content: 'Alpha Beta Gamma',
          title: 'Parent'
        })
      }}
      onRevealAnchorInDocument={vi.fn()}
      onSelectBreadcrumbNode={vi.fn()}
      onSelectNode={onSelectNode}
      reviewCurrentNodeId={null}
      reviewQueueNodeIds={[]}
      reviewSchedulerSettings={{} as never}
      trashedNodeIds={[]}
    />
  );

  expect(await screen.findByText(/source details below come from that parent/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open parent note' })).not.toBeInTheDocument();
  expect(onSelectNode).not.toHaveBeenCalled();
});
