import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { WorkspaceRightSidebarHighlightsPanel } from './WorkspaceRightSidebarHighlightsPanel';

const BASE_NODE: Node = {
  kind: 'topic',
  content: '# Parent',
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

it('hides unresolved text locator highlights from the sidebar list', () => {
  const parent: Node = {
    ...BASE_NODE,
    id: 'node-parent',
    content: 'Alpha  Gamma'
  };
  const unresolvedHighlight: Node = {
    ...BASE_NODE,
    id: 'node-highlight',
    parentNodeId: 'node-parent',
    content: 'Beta',
    title: 'Beta',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: {
        from: 6,
        originalText: 'Beta',
        to: 6
      }
    }
  };

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-parent"
      nodeOrder={['node-parent', 'node-highlight']}
      trashedNodeIds={[]}
      nodesById={{ 'node-parent': parent, 'node-highlight': unresolvedHighlight }}
      onRevealHighlight={() => undefined}
    />
  );

  expect(screen.getByText('This node and its child nodes have no highlight nodes yet.')).toBeInTheDocument();
});

it('keeps resolved text locator highlights visible in the sidebar list', () => {
  const parent: Node = {
    ...BASE_NODE,
    id: 'node-parent',
    content: 'Alpha Beta Gamma'
  };
  const resolvedHighlight: Node = {
    ...BASE_NODE,
    id: 'node-highlight',
    parentNodeId: 'node-parent',
    content: 'Beta',
    title: 'Beta',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: {
        from: 6,
        originalText: 'Beta',
        to: 10
      }
    }
  };

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-parent"
      nodeOrder={['node-parent', 'node-highlight']}
      trashedNodeIds={[]}
      nodesById={{ 'node-parent': parent, 'node-highlight': resolvedHighlight }}
      onRevealHighlight={() => undefined}
    />
  );

  expect(screen.getByRole('button', { name: 'Highlight Beta' })).toBeInTheDocument();
  expect(screen.getByText('Total highlights: 1')).toBeInTheDocument();
});

it('keeps text locator highlights visible when the parent document body is not loaded yet', () => {
  const unloadedParent: Node = {
    ...BASE_NODE,
    id: 'node-parent',
    content: '',
    hasContent: true
  };
  const resolvedHighlight: Node = {
    ...BASE_NODE,
    id: 'node-highlight',
    parentNodeId: 'node-parent',
    content: 'Beta',
    title: 'Beta',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: {
        from: 6,
        originalText: 'Beta',
        to: 10
      }
    }
  };

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-parent"
      nodeOrder={['node-parent', 'node-highlight']}
      trashedNodeIds={[]}
      nodesById={{ 'node-parent': unloadedParent, 'node-highlight': resolvedHighlight }}
      onRevealHighlight={() => undefined}
    />
  );

  expect(screen.getByRole('button', { name: 'Highlight Beta' })).toBeInTheDocument();
  expect(screen.getByText('Total highlights: 1')).toBeInTheDocument();
});

it('hides unresolved text locator clozes from the sidebar list', () => {
  const parent: Node = {
    ...BASE_NODE,
    id: 'node-parent',
    content: 'Alpha  Gamma'
  };
  const unresolvedCloze: Node = {
    ...BASE_NODE,
    id: 'node-cloze',
    parentNodeId: 'node-parent',
    content: 'Alpha [...] Gamma',
    reveal: 'Beta',
    title: 'Alpha [...] Gamma',
    anchorLink: {
      id: 'cloze-1',
      kind: 'cloze',
      locator: {
        from: 6,
        originalText: 'Beta',
        to: 6
      }
    }
  };

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-parent"
      nodeOrder={['node-parent', 'node-cloze']}
      trashedNodeIds={[]}
      nodesById={{ 'node-parent': parent, 'node-cloze': unresolvedCloze }}
      onRevealHighlight={() => undefined}
    />
  );

  expect(screen.getByText('This node and its child nodes have no highlight nodes yet.')).toBeInTheDocument();
});
