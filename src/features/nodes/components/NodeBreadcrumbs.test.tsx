import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';

import { NodeBreadcrumbs } from './NodeBreadcrumbs';

it('shows only the ancestors, without kind labels', () => {
  renderWithLocalization(
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
  expect(screen.queryByRole('button', { name: 'Card' })).not.toBeInTheDocument();
  expect(screen.queryByText('Folder')).not.toBeInTheDocument();
  expect(screen.queryByText('Topic')).not.toBeInTheDocument();
});

it('routes nested topic breadcrumb selections to that topic', () => {
  const onSelectNode = vi.fn();

  renderWithLocalization(
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

it('hides the open cloze answer in its parent extract title', () => {
  const base = { createdAt: '', hasContent: true, hasReveal: false, review: null, updatedAt: '' };
  renderWithLocalization(
    <NodeBreadcrumbs
      activeNodeId="cloze-1"
      nodesById={{
        'topic-1': { ...base, id: 'topic-1', kind: 'topic', parentNodeId: null, title: 'Article' },
        'extract-1': { ...base, id: 'extract-1', kind: 'item', parentNodeId: 'topic-1', title: 'Cells **burn** sugar' },
        'cloze-1': {
          ...base,
          anchorLink: { id: 'a-1', kind: 'cloze', locator: { from: 6, originalText: 'burn', to: 10 } },
          id: 'cloze-1',
          kind: 'item',
          parentNodeId: 'extract-1',
          title: 'Cells [...] sugar'
        }
      }}
      onSelectNode={vi.fn()}
    />
  );
  expect(screen.getByRole('button', { name: 'Cells * sugar' })).toBeInTheDocument();
  expect(screen.queryByText(/burn/)).not.toBeInTheDocument();
});
