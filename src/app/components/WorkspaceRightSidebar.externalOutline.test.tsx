import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';

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

function renderOutlineSidebar(args: {
  internalContent?: string;
  outlineDocument?: {
    activePosition: number;
    content: string;
    onRevealPosition: (position: number) => void;
  };
  onRevealDocumentPosition?: (position: number) => void;
}) {
  const node = createNode({
    content: args.internalContent ?? '# Internal heading\n\nBody',
    id: 'node-1',
    title: 'Internal'
  });

  renderWithLocalization(
    <WorkspaceRightSidebar
      activeNodeId="node-1"
      activePanelId="outline"
      nodeOrder={['node-1']}
      nodesById={{ 'node-1': node }}
      onRevealAnchorInDocument={vi.fn()}
      onRevealDocumentPosition={args.onRevealDocumentPosition ?? vi.fn()}
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

it('renders external document headings in the outline panel instead of the active internal topic', async () => {
  const onRevealExternalPosition = vi.fn();

  renderOutlineSidebar({
    outlineDocument: {
      activePosition: 0,
      content: '# External title\n\n## External section\n\n### External detail',
      onRevealPosition: onRevealExternalPosition
    }
  });

  expect(await screen.findByRole('button', { name: 'External section' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'External detail' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Internal heading' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'External section' }));

  expect(onRevealExternalPosition).toHaveBeenCalledWith(21);
});

it('does not leak the previous internal topic outline while an external non-document view is open', async () => {
  renderOutlineSidebar({
    outlineDocument: {
      activePosition: 0,
      content: '',
      onRevealPosition: vi.fn()
    }
  });

  expect(await screen.findByText('This document has no outline headings yet.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Internal heading' })).not.toBeInTheDocument();
});
