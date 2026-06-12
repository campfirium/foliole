import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';

vi.mock('../../features/pdf/model/pdfSystemBridge', () => ({
  requestPdfAnchorJump: vi.fn()
}));

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

beforeEach(() => {
  vi.clearAllMocks();
});

it('renders backlinks in the dedicated inspector panel and opens the linked note', async () => {
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

  expect(await screen.findByRole('heading', { level: 3, name: 'Backlinks' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /source note/i }));

  expect(onSelectNode).toHaveBeenCalledWith('source');
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

  expect(screen.queryByRole('list', { name: 'Document highlights' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Alpha \[\.\.\.\] Gamma/i })).not.toBeInTheDocument();
  expect(onSelectNode).not.toHaveBeenCalled();
  expect(onRevealAnchorInDocument).not.toHaveBeenCalled();
});
