import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { WorkspaceRightSidebarHighlightsPanel } from './WorkspaceRightSidebarHighlightsPanel';

const BASE_NODE: Node = {
  content:
    '# Note\n\nBefore <highlight id="1">first marked text</highlight id="1"> after.\n\n<highlight id="2">Second marked text</highlight id="2">',
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

it('renders document highlights with breathing room and click actions', () => {
  const onRevealHighlight = vi.fn();

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': BASE_NODE }}
      onRevealHighlight={onRevealHighlight}
    />
  );

  expect(screen.getByRole('list', { name: 'Document highlights' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /first marked text/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Second marked text/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Second marked text/i }));
  expect(onRevealHighlight).toHaveBeenCalledWith('2');
});

it('shows an empty state when the document has no highlights', () => {
  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': { ...BASE_NODE, content: '# Note\n\nNo marked text here.' } }}
      onRevealHighlight={() => undefined}
    />
  );

  expect(screen.getByText('This document has no highlights yet.')).toBeInTheDocument();
});
