import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

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

it('renders highlight child nodes from the subtree and emits selected node id', () => {
  const onRevealHighlight = vi.fn();
  const highlightA: Node = {
    ...BASE_NODE,
    id: 'node-2',
    parentNodeId: 'node-1',
    content: 'first marked text',
    anchorLink: { id: 'a1', kind: 'highlight' }
  };
  const highlightB: Node = {
    ...BASE_NODE,
    id: 'node-3',
    parentNodeId: 'node-1',
    content: 'Second marked text',
    anchorLink: { id: 'a2', kind: 'highlight' }
  };

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodeOrder={['node-1', 'node-2', 'node-3']}
      trashedNodeIds={[]}
      nodesById={{ 'node-1': BASE_NODE, 'node-2': highlightA, 'node-3': highlightB }}
      onRevealHighlight={onRevealHighlight}
    />
  );

  expect(screen.getByRole('list', { name: 'Document highlights' })).toBeInTheDocument();
  expect(screen.getByText('Total highlights: 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /first marked text/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Second marked text/i })).toBeInTheDocument();
  const rows = within(screen.getByRole('list', { name: 'Document highlights' }))
    .getAllByRole('button')
    .map((item) => item.textContent);
  expect(rows).toEqual(['Highlightfirst marked text', 'HighlightSecond marked text']);

  fireEvent.click(screen.getByRole('button', { name: /Second marked text/i }));
  expect(onRevealHighlight).toHaveBeenCalledWith('node-3');
});

it('shows an empty state when the subtree has no highlight nodes', () => {
  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodeOrder={['node-1']}
      trashedNodeIds={[]}
      nodesById={{ 'node-1': { ...BASE_NODE, content: '# Note\n\nNo marked text here.' } }}
      onRevealHighlight={() => undefined}
    />
  );

  expect(screen.getByText('This node and its child nodes have no highlight nodes yet.')).toBeInTheDocument();
});

it('includes highlight nodes from nested descendants', () => {
  const onRevealHighlight = vi.fn();
  const chapterNode: Node = {
    ...BASE_NODE,
    id: 'node-2',
    parentNodeId: 'node-1',
    title: 'Chapter',
    content: '# Chapter'
  };
  const childHighlightNode: Node = {
    ...BASE_NODE,
    id: 'node-3',
    parentNodeId: 'node-2',
    content: 'child marked text',
    anchorLink: { id: '7', kind: 'highlight' }
  };

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodeOrder={['node-1', 'node-2', 'node-3']}
      trashedNodeIds={[]}
      nodesById={{ 'node-1': BASE_NODE, 'node-2': chapterNode, 'node-3': childHighlightNode }}
      onRevealHighlight={onRevealHighlight}
    />
  );

  const childHighlightButton = screen.getByRole('button', { name: /child marked text/i });
  expect(childHighlightButton).toBeInTheDocument();
  fireEvent.click(childHighlightButton);
  expect(onRevealHighlight).toHaveBeenCalledWith('node-3');
});

it('follows tree order from nodeOrder instead of object insertion order', () => {
  const onRevealHighlight = vi.fn();
  const highlightA: Node = {
    ...BASE_NODE,
    id: 'node-a',
    parentNodeId: 'node-1',
    content: 'A highlight',
    anchorLink: { id: 'a', kind: 'highlight' }
  };
  const highlightB: Node = {
    ...BASE_NODE,
    id: 'node-b',
    parentNodeId: 'node-1',
    content: 'B highlight',
    anchorLink: { id: 'b', kind: 'highlight' }
  };

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodeOrder={['node-1', 'node-a', 'node-b']}
      trashedNodeIds={[]}
      nodesById={{ 'node-1': BASE_NODE, 'node-b': highlightB, 'node-a': highlightA }}
      onRevealHighlight={onRevealHighlight}
    />
  );

  const rows = within(screen.getByRole('list', { name: 'Document highlights' }))
    .getAllByRole('button')
    .map((item) => item.textContent);
  expect(rows).toEqual(['HighlightA highlight', 'HighlightB highlight']);
});

it('keeps subtree traversal order when nodeOrder is not contiguous by subtree', () => {
  const onRevealHighlight = vi.fn();
  const chapterNode: Node = {
    ...BASE_NODE,
    id: 'node-chapter',
    parentNodeId: 'node-1',
    title: 'Chapter',
    content: '# Chapter'
  };
  const chapterHighlight: Node = {
    ...BASE_NODE,
    id: 'node-hl-a',
    parentNodeId: 'node-chapter',
    content: 'A from chapter',
    anchorLink: { id: 'ha', kind: 'highlight' }
  };
  const siblingHighlight: Node = {
    ...BASE_NODE,
    id: 'node-hl-b',
    parentNodeId: 'node-1',
    content: 'B sibling highlight',
    anchorLink: { id: 'hb', kind: 'highlight' }
  };

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodeOrder={['node-1', 'node-chapter', 'node-hl-b', 'node-hl-a']}
      trashedNodeIds={[]}
      nodesById={{
        'node-1': BASE_NODE,
        'node-chapter': chapterNode,
        'node-hl-b': siblingHighlight,
        'node-hl-a': chapterHighlight
      }}
      onRevealHighlight={onRevealHighlight}
    />
  );

  const rows = within(screen.getByRole('list', { name: 'Document highlights' }))
    .getAllByRole('button')
    .map((item) => item.textContent);
  expect(rows).toEqual(['HighlightA from chapter', 'HighlightB sibling highlight']);
});

it('keeps repeated highlight text entries as separate items when they are different objects', () => {
  const onRevealHighlight = vi.fn();
  const highlightA: Node = {
    ...BASE_NODE,
    id: 'node-hl-a',
    parentNodeId: 'node-1',
    content: 'Repeated line',
    anchorLink: { id: 'ha', kind: 'highlight' }
  };
  const highlightB: Node = {
    ...BASE_NODE,
    id: 'node-hl-b',
    parentNodeId: 'node-1',
    content: 'Repeated line',
    anchorLink: { id: 'hb', kind: 'highlight' }
  };

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodeOrder={['node-1', 'node-hl-a', 'node-hl-b']}
      trashedNodeIds={[]}
      nodesById={{ 'node-1': BASE_NODE, 'node-hl-a': highlightA, 'node-hl-b': highlightB }}
      onRevealHighlight={onRevealHighlight}
    />
  );

  const rows = within(screen.getByRole('list', { name: 'Document highlights' })).getAllByRole('button');
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent('Highlight');
  expect(rows[0]).toHaveTextContent('Repeated line');
  expect(rows[1]).toHaveTextContent('Highlight');
  expect(rows[1]).toHaveTextContent('Repeated line');
  expect(screen.getByText('Total highlights: 2')).toBeInTheDocument();
});

it('keeps highlight and cloze items separate even when their text matches', () => {
  const onRevealHighlight = vi.fn();
  const highlightNode: Node = {
    ...BASE_NODE,
    id: 'node-hl',
    parentNodeId: 'node-1',
    content: 'Shared text',
    anchorLink: { id: 'ha', kind: 'highlight' }
  };
  const clozeNode: Node = {
    ...BASE_NODE,
    id: 'node-cloze',
    parentNodeId: 'node-1',
    content: 'Shared text',
    reveal: 'Shared text',
    anchorLink: { id: 'ca', kind: 'cloze' }
  };

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodeOrder={['node-1', 'node-hl', 'node-cloze']}
      trashedNodeIds={[]}
      nodesById={{ 'node-1': BASE_NODE, 'node-hl': highlightNode, 'node-cloze': clozeNode }}
      onRevealHighlight={onRevealHighlight}
    />
  );

  const rows = within(screen.getByRole('list', { name: 'Document highlights' })).getAllByRole('button');
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent('Highlight');
  expect(rows[0]).toHaveTextContent('Shared text');
  expect(rows[1]).toHaveTextContent('Cloze');
  expect(rows[1]).toHaveTextContent('Shared text');
  expect(screen.getByText('Total highlights: 2')).toBeInTheDocument();
});

it('includes cloze child nodes in the sidebar list', () => {
  const onRevealHighlight = vi.fn();
  const clozeNode: Node = {
    ...BASE_NODE,
    id: 'node-cloze',
    parentNodeId: 'node-1',
    content: 'Study [...] today',
    reveal: 'answer',
    anchorLink: { id: 'c1', kind: 'cloze' }
  };

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodeOrder={['node-1', 'node-cloze']}
      trashedNodeIds={[]}
      nodesById={{ 'node-1': BASE_NODE, 'node-cloze': clozeNode }}
      onRevealHighlight={onRevealHighlight}
    />
  );

  expect(screen.getByRole('button', { name: /Study \[\.\.\.\] today/i })).toBeInTheDocument();
  expect(screen.getByText('Cloze')).toBeInTheDocument();
  expect(screen.getByText('Total highlights: 1')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Study \[\.\.\.\] today/i }));
  expect(onRevealHighlight).toHaveBeenCalledWith('node-cloze');
});
