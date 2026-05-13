import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { WorkspaceRightSidebarHighlightsPanel } from './WorkspaceRightSidebarHighlightsPanel';

const BASE_NODE: Node = {
  kind: 'topic',
  content: '',
  createdAt: '2026-03-24T08:00:00.000Z',
  id: 'node-1',
  parentNodeId: null,
  priority: null,
  desiredRetention: null,
  reveal: null,
  review: null,
  title: 'Marked note',
  updatedAt: '2026-03-25T09:00:00.000Z'
};

function createParentNode(id: string, content: string, parentNodeId: string | null = null): Node {
  return {
    ...BASE_NODE,
    id,
    content,
    parentNodeId
  };
}

function createTextAnchorNode(args: {
  id: string;
  parentContent: string;
  parentNodeId: string;
  selectedText: string;
  content: string;
}) {
  const from = args.parentContent.indexOf(args.selectedText);
  return {
    ...BASE_NODE,
    id: args.id,
    parentNodeId: args.parentNodeId,
    content: args.content,
    anchorLink: {
      id: `highlight-${args.id}`,
      kind: 'highlight' as const,
      locator: {
        from,
        originalText: args.selectedText,
        to: from + args.selectedText.length
      }
    }
  } satisfies Node;
}

it('keeps rendering stable when the active node appears after the empty state render', () => {
  const parentContent = 'first marked text';
  const parentNode = createParentNode('node-1', parentContent);
  const highlightNode = createTextAnchorNode({
    content: 'first marked text',
    id: 'node-2',
    parentContent,
    parentNodeId: 'node-1',
    selectedText: 'first marked text'
  });

  const { rerender } = render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId={null}
      nodeOrder={['node-1', 'node-2']}
      trashedNodeIds={[]}
      nodesById={{ 'node-1': parentNode, 'node-2': highlightNode }}
      onRevealHighlight={() => undefined}
    />
  );

  expect(screen.getByText('Select a document to browse its highlights.')).toBeInTheDocument();

  rerender(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodeOrder={['node-1', 'node-2']}
      trashedNodeIds={[]}
      nodesById={{ 'node-1': parentNode, 'node-2': highlightNode }}
      onRevealHighlight={() => undefined}
    />
  );

  expect(screen.getByText('HIGHLIGHTS(1)')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /first marked text/i })).toBeInTheDocument();
});
