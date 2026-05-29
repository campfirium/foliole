import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { FolderListView } from './FolderListView';

function createNode(overrides: Partial<Node> & Pick<Node, 'id' | 'title'>): Node {
  return {
    id: overrides.id,
    parentNodeId: overrides.parentNodeId === undefined ? 'folder-1' : overrides.parentNodeId,
    kind: overrides.kind ?? 'topic',
    title: overrides.title,
    content: overrides.content ?? '',
    openingText: overrides.openingText ?? null,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    createdAt: overrides.createdAt ?? '2026-04-01T09:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-02T10:30:00.000Z'
  };
}

it('keeps long titles, empty bodies, and long summaries clamped inside the row', () => {
  render(
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={['folder-1', 'node-4', 'node-5']}
      nodesById={{
        'folder-1': createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' }),
        'node-4': createNode({
          id: 'node-4',
          title: 'An extremely long title that should stay readable without pushing the whole folder list row out of shape',
          content: ''
        }),
        'node-5': createNode({
          id: 'node-5',
          title: 'Long summary',
          content: 'This summary keeps going '.repeat(40)
        })
      }}
      onChangeSortDirection={() => undefined}
      onChangeSortKey={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  expect(screen.getByTestId('folder-list-title-node-4').className).toContain('truncate');
  expect(screen.getByTestId('folder-list-excerpt-node-4')).toHaveTextContent('');
  expect(screen.getByTestId('folder-list-excerpt-node-4').className).toContain('line-clamp-4');
  expect(screen.getByTestId('folder-list-excerpt-node-4').className).toContain('h-28');
  expect(screen.getByTestId('folder-list-excerpt-node-5').className).toContain('line-clamp-4');
  expect(screen.getByTestId('folder-list-excerpt-node-5').className).toContain('h-28');
  expect(screen.getByRole('button', { name: /Open An extremely long title/u }).closest('li')?.className).toContain('border-b');
  expect(screen.queryByText('Topic')).not.toBeInTheDocument();
});

it('reserves the current-view action slot when no action is available', () => {
  render(
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={['folder-1']}
      nodesById={{
        'folder-1': createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Virtual' })
      }}
      onChangeSortDirection={() => undefined}
      onChangeSortKey={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  expect(screen.getByTestId('folder-list-action-placeholder')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('button', { name: 'Current view actions' })).not.toBeInTheDocument();
});

it('hides the embedded folder header when requested', () => {
  render(
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={['folder-1']}
      nodesById={{
        'folder-1': createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Library root' })
      }}
      onChangeSortDirection={() => undefined}
      onChangeSortKey={() => undefined}
      onSelectNode={() => undefined}
      showEmbeddedHeader={false}
    />
  );

  expect(screen.queryByRole('button', { name: 'Sort list by Imported' })).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox', { name: 'Search folder contents' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 2, name: 'Library root' })).not.toBeInTheDocument();
});
