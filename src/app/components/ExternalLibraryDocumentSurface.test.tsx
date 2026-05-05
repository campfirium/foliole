import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ExternalLibraryDocumentSurface } from './ExternalLibraryDocumentSurface';

const folders = [
  {
    attachmentMode: 'document_relative_first_then_fixed_root' as const,
    attachmentRootPath: null,
    createdAt: '2026-04-21T00:00:00.000Z',
    documentCount: 2,
    excludedDirs: [],
    folderPath: '/library/test 6',
    id: 'folder-1',
    indexedAt: '2026-04-21T00:00:00.000Z',
    lastError: null,
    status: 'ready' as const,
    updatedAt: '2026-04-21T00:00:00.000Z'
  }
];

const entriesByFolderId = {
  'folder-1': [
    {
      absolutePath: '/library/test 6/one.md',
      extension: 'md' as const,
      fileName: 'one.md',
      folderId: 'folder-1',
      folderPath: '/library/test 6',
      modifiedAt: '2026-04-19T00:00:00.000Z',
      openingText: 'First opening preview from cache.',
      relativePath: 'one.md',
      title: 'First title'
    },
    {
      absolutePath: '/library/test 6/two.md',
      extension: 'md' as const,
      fileName: 'two.md',
      folderId: 'folder-1',
      folderPath: '/library/test 6',
      modifiedAt: '2026-04-17T00:00:00.000Z',
      openingText: 'Second opening preview from cache.',
      relativePath: 'two.md',
      title: 'Second title'
    }
  ]
};

it('renders the external folder contents in the center document area using the folder list view', () => {
  const onOpenSelection = vi.fn();

  render(
    <ExternalLibraryDocumentSurface
      documentMaxWidth={760}
      entriesByFolderId={entriesByFolderId}
      folders={folders}
      onOpenImportedNode={vi.fn()}
      onOpenSelection={onOpenSelection}
      onResetLayout={vi.fn()}
      onStartDocumentResize={vi.fn()}
      selection={{ folderId: 'folder-1', kind: 'folder' }}
    />
  );

  expect(screen.getByRole('searchbox', { name: 'Search folder contents' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sort list by Date saved' })).toBeInTheDocument();
  expect(screen.getByTestId('folder-list-count')).toHaveTextContent('2');
  expect(screen.getByTestId('folder-list-title-/library/test 6/one.md')).toHaveTextContent('First title');
  expect(screen.getByTestId('folder-list-excerpt-/library/test 6/one.md')).toHaveTextContent('First opening preview from cache.');
  expect(screen.getByTestId('folder-list-date-/library/test 6/one.md')).toHaveTextContent('2026-04-19');

  fireEvent.click(screen.getByRole('button', { name: 'Open First title' }));

  expect(onOpenSelection).toHaveBeenCalledWith({
    absolutePath: '/library/test 6/one.md',
    folderId: 'folder-1',
    kind: 'document'
  });
});
