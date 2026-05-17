import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

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
  kind: 'highlight' | 'cloze';
  parentContent: string;
  parentNodeId: string;
  selectedText: string;
  content: string;
  reveal?: string | null;
}) {
  const from = args.parentContent.indexOf(args.selectedText);
  return {
    ...BASE_NODE,
    id: args.id,
    parentNodeId: args.parentNodeId,
    content: args.content,
    reveal: args.reveal ?? null,
    anchorLink: {
      id: `${args.kind}-${args.id}`,
      kind: args.kind,
      locator: {
        from,
        originalText: args.selectedText,
        to: from + args.selectedText.length
      }
    }
  } satisfies Node;
}

it('renders locator-backed highlight child nodes and emits selected node id', () => {
  const onRevealHighlight = vi.fn();
  const parentContent = 'first marked text\nSecond marked text';
  const parentNode = createParentNode('node-1', parentContent);
  const highlightA = createTextAnchorNode({
    content: 'first marked text',
    id: 'node-2',
    kind: 'highlight',
    parentContent,
    parentNodeId: 'node-1',
    selectedText: 'first marked text'
  });
  const highlightB = createTextAnchorNode({
    content: 'Second marked text',
    id: 'node-3',
    kind: 'highlight',
    parentContent,
    parentNodeId: 'node-1',
    selectedText: 'Second marked text'
  });

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodeOrder={['node-1', 'node-2', 'node-3']}
      trashedNodeIds={[]}
      nodesById={{ 'node-1': parentNode, 'node-2': highlightA, 'node-3': highlightB }}
      onRevealHighlight={onRevealHighlight}
    />
  );

  const rows = within(screen.getByRole('list', { name: 'Document highlights' }))
    .getAllByRole('button')
    .map((item) => item.textContent);
  expect(rows).toEqual(['first marked text', 'Second marked text']);
  expect(screen.getByText('HIGHLIGHTS(2)')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Second marked text/i }));
  expect(onRevealHighlight).toHaveBeenCalledWith('node-3');
});

it('shows an empty state when no locator-backed highlight nodes exist', () => {
  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodeOrder={['node-1']}
      trashedNodeIds={[]}
      nodesById={{ 'node-1': createParentNode('node-1', '# Note\n\nNo marked text here.') }}
      onRevealHighlight={() => undefined}
    />
  );

  expect(screen.queryByRole('list', { name: 'Document highlights' })).not.toBeInTheDocument();
});

it('includes locator-backed highlights from nested descendants in tree order', () => {
  const onRevealHighlight = vi.fn();
  const rootContent = 'A from chapter\nB sibling highlight';
  const rootNode = createParentNode('node-1', rootContent);
  const chapterNode = createParentNode('node-chapter', '# Chapter', 'node-1');
  const chapterHighlight = createTextAnchorNode({
    content: 'A from chapter',
    id: 'node-hl-a',
    kind: 'highlight',
    parentContent: rootContent,
    parentNodeId: 'node-1',
    selectedText: 'A from chapter'
  });
  const siblingHighlight = createTextAnchorNode({
    content: 'B sibling highlight',
    id: 'node-hl-b',
    kind: 'highlight',
    parentContent: rootContent,
    parentNodeId: 'node-1',
    selectedText: 'B sibling highlight'
  });

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodeOrder={['node-1', 'node-chapter', 'node-hl-b', 'node-hl-a']}
      trashedNodeIds={[]}
      nodesById={{
        'node-1': rootNode,
        'node-chapter': chapterNode,
        'node-hl-a': chapterHighlight,
        'node-hl-b': siblingHighlight
      }}
      onRevealHighlight={onRevealHighlight}
    />
  );

  const rows = within(screen.getByRole('list', { name: 'Document highlights' }))
    .getAllByRole('button')
    .map((item) => item.textContent);
  expect(rows).toEqual(['B sibling highlight', 'A from chapter']);
});

it('keeps repeated locator-backed highlight text as separate items', () => {
  const parentContent = 'Repeated line\nRepeated line';
  const parentNode = createParentNode('node-1', parentContent);
  const highlightA = createTextAnchorNode({
    content: 'Repeated line',
    id: 'node-hl-a',
    kind: 'highlight',
    parentContent,
    parentNodeId: 'node-1',
    selectedText: 'Repeated line'
  });
  const highlightB = createTextAnchorNode({
    content: 'Repeated line',
    id: 'node-hl-b',
    kind: 'highlight',
    parentContent: parentContent.replace('Repeated line', 'x'.repeat('Repeated line'.length)),
    parentNodeId: 'node-1',
    selectedText: 'Repeated line'
  });
  const adjustedHighlightB: Node = {
    ...highlightB,
    anchorLink: {
      ...highlightB.anchorLink!,
      locator: {
        from: parentContent.lastIndexOf('Repeated line'),
        originalText: 'Repeated line',
        to: parentContent.lastIndexOf('Repeated line') + 'Repeated line'.length
      }
    }
  };

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodeOrder={['node-1', 'node-hl-a', 'node-hl-b']}
      trashedNodeIds={[]}
      nodesById={{ 'node-1': parentNode, 'node-hl-a': highlightA, 'node-hl-b': adjustedHighlightB }}
      onRevealHighlight={() => undefined}
    />
  );

  expect(within(screen.getByRole('list', { name: 'Document highlights' })).getAllByRole('button')).toHaveLength(2);
  expect(screen.getByText('HIGHLIGHTS(2)')).toBeInTheDocument();
});

it('excludes cloze child nodes from the sidebar list', () => {
  const parentContent = 'Study answer today';
  const parentNode = createParentNode('node-1', parentContent);
  const clozeNode = createTextAnchorNode({
    content: 'Study [...] today',
    id: 'node-cloze',
    kind: 'cloze',
    parentContent,
    parentNodeId: 'node-1',
    reveal: 'answer',
    selectedText: 'answer'
  });

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodeOrder={['node-1', 'node-cloze']}
      trashedNodeIds={[]}
      nodesById={{ 'node-1': parentNode, 'node-cloze': clozeNode }}
      onRevealHighlight={() => undefined}
    />
  );

  expect(screen.queryByRole('list', { name: 'Document highlights' })).not.toBeInTheDocument();
});
