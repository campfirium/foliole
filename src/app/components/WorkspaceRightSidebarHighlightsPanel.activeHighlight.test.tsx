import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarHighlightsPanel } from './WorkspaceRightSidebarHighlightsPanel';

function createTopicNode(args: {
  content: string;
  id: string;
  parentNodeId?: string | null;
}): Node {
  return {
    content: args.content,
    createdAt: '2026-03-24T08:00:00.000Z',
    desiredRetention: null,
    id: args.id,
    kind: 'topic',
    parentNodeId: args.parentNodeId ?? null,
    priority: null,
    reading: null,
    reveal: null,
    review: null,
    title: 'Marked note',
    updatedAt: '2026-03-25T09:00:00.000Z'
  };
}

function createHighlightNode(args: {
  content: string;
  id: string;
  parentContent: string;
  parentNodeId: string;
  selectedText: string;
}): Node {
  const from = args.parentContent.indexOf(args.selectedText);
  return {
    ...createTopicNode({
      content: args.content,
      id: args.id,
      parentNodeId: args.parentNodeId
    }),
    anchorLink: {
      id: `highlight-${args.id}`,
      kind: 'highlight',
      locator: {
        from,
        originalText: args.selectedText,
        to: from + args.selectedText.length
      }
    }
  };
}

it('does not aggregate highlights when the active node is a highlight node', () => {
  const parentContent = 'Study answer today';
  const parentNode = createTopicNode({ content: parentContent, id: 'node-parent' });
  const activeHighlightNode = createHighlightNode({
    content: 'answer',
    id: 'node-highlight',
    parentContent,
    parentNodeId: 'node-parent',
    selectedText: 'answer'
  });

  renderWithLocalization(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-highlight"
      nodeOrder={['node-parent', 'node-highlight']}
      nodesById={{ 'node-highlight': activeHighlightNode, 'node-parent': parentNode }}
      onRevealHighlight={() => undefined}
      trashedNodeIds={[]}
    />
  );

  expect(screen.queryByRole('list', { name: 'Document highlights' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'answer' })).not.toBeInTheDocument();
});
