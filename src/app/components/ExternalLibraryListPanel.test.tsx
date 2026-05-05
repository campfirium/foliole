import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ExternalLibraryListPanel } from './ExternalLibraryListPanel';

const folders = [
  {
    attachmentMode: 'document_relative_first_then_fixed_root' as const,
    attachmentRootPath: null,
    createdAt: '2026-04-21T00:00:00.000Z',
    documentCount: 2,
    excludedDirs: [],
    folderPath: '/library/two think',
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
      absolutePath: '/library/two think/a.md',
      extension: 'md' as const,
      fileName: 'a.md',
      folderId: 'folder-1',
      folderPath: '/library/two think',
      modifiedAt: '2026-04-21T00:00:00.000Z',
      openingText: 'The first useful sentence inside this external document.',
      relativePath: 'a.md',
      title: 'Alpha title'
    }
  ]
};

it('reuses the compact item row style for external library items without dates or opening previews', () => {
  render(
    <ExternalLibraryListPanel
      entriesByFolderId={entriesByFolderId}
      folders={folders}
      onOpenExternalSelection={vi.fn()}
      selection={{ folderId: 'folder-1', kind: 'folder' }}
    />
  );

  expect(screen.getByRole('treeitem', { name: 'Alpha title' })).toBeInTheDocument();
  expect(screen.queryByText('2026-04-21')).toBeNull();
  expect(screen.queryByText('The first useful sentence inside this external document.')).toBeNull();
});

it('opens the selected document in the external workspace surface', () => {
  const onOpenExternalSelection = vi.fn();

  render(
    <ExternalLibraryListPanel
      entriesByFolderId={entriesByFolderId}
      folders={folders}
      onOpenExternalSelection={onOpenExternalSelection}
      selection={{ folderId: 'folder-1', kind: 'folder' }}
    />
  );

  fireEvent.click(screen.getByRole('treeitem', { name: 'Alpha title' }));

  expect(onOpenExternalSelection).toHaveBeenCalledWith({
    absolutePath: '/library/two think/a.md',
    folderId: 'folder-1',
    kind: 'document'
  });
});
