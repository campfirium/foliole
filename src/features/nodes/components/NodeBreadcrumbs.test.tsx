import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { NodeBreadcrumbs } from './NodeBreadcrumbs';

it('shows breadcrumb titles without kind labels', () => {
  render(
    <NodeBreadcrumbs
      activeNodeId="item-1"
      nodesById={{
        'folder-1': {
          createdAt: '',
          hasContent: false,
          hasReveal: false,
          id: 'folder-1',
          kind: 'folder',
          parentNodeId: null,
          review: null,
          title: 'Knowledge',
          updatedAt: ''
        },
        'topic-1': {
          createdAt: '',
          hasContent: true,
          hasReveal: false,
          id: 'topic-1',
          kind: 'topic',
          parentNodeId: 'folder-1',
          review: null,
          title: 'Article',
          updatedAt: ''
        },
        'topic-2': {
          createdAt: '',
          hasContent: true,
          hasReveal: false,
          id: 'topic-2',
          kind: 'topic',
          parentNodeId: 'topic-1',
          review: null,
          title: 'Nested topic',
          updatedAt: ''
        },
        'item-1': {
          createdAt: '',
          hasContent: false,
          hasReveal: true,
          id: 'item-1',
          kind: 'item',
          parentNodeId: 'topic-2',
          review: null,
          title: 'Card',
          updatedAt: ''
        }
      }}
      onSelectNode={vi.fn()}
    />
  );

  expect(screen.getByRole('button', { name: 'Knowledge' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Article' })).toBeInTheDocument();
  expect(screen.queryByText('Folder')).not.toBeInTheDocument();
  expect(screen.queryByText('Topic')).not.toBeInTheDocument();
});

it('routes nested topic breadcrumb selections to that topic', () => {
  const onSelectNode = vi.fn();

  render(
    <NodeBreadcrumbs
      activeNodeId="item-1"
      nodesById={{
        'folder-1': {
          createdAt: '',
          hasContent: false,
          hasReveal: false,
          id: 'folder-1',
          kind: 'folder',
          parentNodeId: null,
          review: null,
          title: 'Knowledge',
          updatedAt: ''
        },
        'topic-1': {
          createdAt: '',
          hasContent: true,
          hasReveal: false,
          id: 'topic-1',
          kind: 'topic',
          parentNodeId: 'folder-1',
          review: null,
          title: 'Article',
          updatedAt: ''
        },
        'topic-2': {
          createdAt: '',
          hasContent: true,
          hasReveal: false,
          id: 'topic-2',
          kind: 'topic',
          parentNodeId: 'topic-1',
          review: null,
          title: 'Nested topic',
          updatedAt: ''
        },
        'item-1': {
          createdAt: '',
          hasContent: false,
          hasReveal: true,
          id: 'item-1',
          kind: 'item',
          parentNodeId: 'topic-2',
          review: null,
          title: 'Card',
          updatedAt: ''
        }
      }}
      onSelectNode={onSelectNode}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Nested topic' }));

  expect(onSelectNode).toHaveBeenCalledWith('topic-2');
});
