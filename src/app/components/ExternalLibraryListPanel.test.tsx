import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { ElectronAPI } from '../../shared/platform/electronApi';

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
    },
    {
      absolutePath: '/library/two think/b.md',
      extension: 'md' as const,
      fileName: 'b.md',
      folderId: 'folder-1',
      folderPath: '/library/two think',
      modifiedAt: '2026-04-20T00:00:00.000Z',
      openingText: 'The second useful sentence inside this external document.',
      relativePath: 'b.md',
      title: 'Beta title'
    }
  ]
};

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

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
  expect(screen.getByRole('button', { name: 'Sort list by Modified time' })).toBeInTheDocument();
  expect(screen.queryByText('2026-04-21')).toBeNull();
  expect(screen.queryByText('The first useful sentence inside this external document.')).toBeNull();
});

it('offers last opened sorting for external documents', () => {
  render(
    <ExternalLibraryListPanel
      entriesByFolderId={entriesByFolderId}
      folders={folders}
      onOpenExternalSelection={vi.fn()}
      selection={{ folderId: 'folder-1', kind: 'folder' }}
    />
  );

  fireEvent.keyDown(screen.getByRole('button', { name: 'Sort list by Modified time' }), { key: 'ArrowDown' });

  expect(screen.getByRole('menuitem', { name: /Last opened/i })).toBeInTheDocument();
});

it('refreshes the selected external folder from the document list toolbar', () => {
  const invoke = vi.fn(async () => folders);
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  render(
    <ExternalLibraryListPanel
      entriesByFolderId={entriesByFolderId}
      folders={folders}
      onOpenExternalSelection={vi.fn()}
      selection={{ directoryPath: 'nested', folderId: 'folder-1', kind: 'directory' }}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Refresh external documents' }));

  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.rebuildExternalSearchIndex, { folder_id: 'folder-1' });
});

it('shows a loading state while the selected external folder entries are not loaded yet', () => {
  render(
    <ExternalLibraryListPanel
      entriesByFolderId={{}}
      folders={folders}
      onOpenExternalSelection={vi.fn()}
      selection={{ folderId: 'folder-1', kind: 'folder' }}
    />
  );

  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  expect(screen.queryByText('No documents')).toBeNull();
});

it('shows the empty state only after the selected external folder entries load empty', () => {
  render(
    <ExternalLibraryListPanel
      entriesByFolderId={{ 'folder-1': [] }}
      folders={folders}
      onOpenExternalSelection={vi.fn()}
      selection={{ folderId: 'folder-1', kind: 'folder' }}
    />
  );

  expect(screen.getByText('No documents')).toBeInTheDocument();
  expect(screen.queryByText('Preparing documents')).toBeNull();
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

it('opens imported external documents in the external workspace surface', () => {
  const onOpenExternalSelection = vi.fn();
  const onSelectNode = vi.fn();

  render(
    <ExternalLibraryListPanel
      entriesByFolderId={{
        'folder-1': [
          {
            ...entriesByFolderId['folder-1'][0]!,
            importedNodeId: 'node-imported'
          }
        ]
      }}
      folders={folders}
      onOpenExternalSelection={onOpenExternalSelection}
      selection={{ folderId: 'folder-1', kind: 'folder' }}
    />
  );

  expect(screen.queryByText('Imported')).toBeNull();
  fireEvent.click(screen.getByRole('treeitem', { name: 'Alpha title' }));

  expect(onOpenExternalSelection).toHaveBeenCalledWith({
    absolutePath: '/library/two think/a.md',
    folderId: 'folder-1',
    kind: 'document'
  });
  expect(onSelectNode).not.toHaveBeenCalled();
});

it('moves external document selection with arrow keys', () => {
  const onOpenExternalSelection = vi.fn();

  render(
    <ExternalLibraryListPanel
      entriesByFolderId={entriesByFolderId}
      folders={folders}
      onOpenExternalSelection={onOpenExternalSelection}
      selection={{ folderId: 'folder-1', kind: 'folder' }}
    />
  );

  fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Alpha title' }), { key: 'ArrowDown' });

  expect(onOpenExternalSelection).toHaveBeenCalledWith({
    absolutePath: '/library/two think/b.md',
    folderId: 'folder-1',
    kind: 'document'
  });
});
