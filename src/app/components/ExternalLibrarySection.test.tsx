import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ExternalLibrarySection } from './ExternalLibrarySection';

function externalFolder(id: string, folderPath: string) {
  return {
    attachmentMode: 'document_relative_first_then_fixed_root' as const,
    attachmentRootPath: null,
    createdAt: '2026-04-21T00:00:00.000Z',
    documentCount: 1,
    excludedDirs: [],
    folderPath,
    id,
    indexedAt: '2026-04-21T00:00:00.000Z',
    lastError: null,
    status: 'ready' as const,
    updatedAt: '2026-04-21T00:00:00.000Z'
  };
}

const folders = [
  externalFolder('folder-1', '/library/1act'),
  externalFolder('folder-2', '/library/2think')
];

beforeEach(() => {
  window.localStorage.clear();
});

it('shows external folders in the persisted manual order', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.externalLibraryFolderOrder,
    JSON.stringify([
      { folderPath: 'library/2think', id: 'folder-2' },
      { folderPath: 'library/1act', id: 'folder-1' }
    ])
  );

  renderWithLocalization(
    <ExternalLibrarySection
      entriesByFolderId={{}}
      folders={folders}
      isExternalViewOpen={false}
      onOpenExternalSelection={vi.fn()}
      selection={{ kind: 'root' }}
    />
  );

  expect(screen.getAllByRole('treeitem').map((item) => item.textContent)).toEqual([
    expect.stringContaining('2think'),
    expect.stringContaining('1act')
  ]);
});

it('groups Readwise-managed external folders under one Readwise row', () => {
  renderWithLocalization(
    <ExternalLibrarySection
      entriesByFolderId={{}}
      folders={[
        externalFolder('readwise-reader-import-articles', '/library/Articles'),
        externalFolder('readwise-reader-import-books', '/library/Books')
      ]}
      isExternalViewOpen={false}
      onOpenExternalSelection={vi.fn()}
      selection={{ kind: 'root' }}
    />
  );

  expect(screen.getByRole('treeitem', { name: /^Readwise$/i })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: /Articles/i })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: /Books/i })).toBeInTheDocument();
  expect(screen.queryByRole('treeitem', { name: /Readwise Articles/i })).toBeNull();
});

it('opens external settings from the setup row keyboard path', () => {
  const onOpenExternalLibrarySettings = vi.fn();

  renderWithLocalization(
    <ExternalLibrarySection
      entriesByFolderId={{}}
      folders={[]}
      isExternalViewOpen
      onOpenExternalLibrarySettings={onOpenExternalLibrarySettings}
      onOpenExternalSelection={vi.fn()}
      selection={{ kind: 'root' }}
    />
  );

  fireEvent.keyDown(screen.getByRole('treeitem', { name: 'External' }), { key: 'Home' });

  expect(onOpenExternalLibrarySettings).toHaveBeenCalledTimes(1);
});

it('keeps external folder tree left and right arrow behavior on hierarchical rows', () => {
  renderWithLocalization(
    <ExternalLibrarySection
      entriesByFolderId={{}}
      folders={[
        externalFolder('readwise-reader-import-articles', '/library/Articles'),
        externalFolder('readwise-reader-import-books', '/library/Books')
      ]}
      isExternalViewOpen={false}
      onOpenExternalSelection={vi.fn()}
      selection={{ kind: 'root' }}
    />
  );

  fireEvent.keyDown(screen.getByRole('treeitem', { name: /^Readwise$/i }), { key: 'ArrowLeft' });

  expect(screen.queryByRole('treeitem', { name: /Articles/i })).toBeNull();

  fireEvent.keyDown(screen.getByRole('treeitem', { name: /^Readwise$/i }), { key: 'ArrowRight' });

  expect(screen.getByRole('treeitem', { name: /Articles/i })).toBeInTheDocument();
});

it('places the external folder icon after the label and keeps the count separate', () => {
  renderWithLocalization(
    <ExternalLibrarySection
      entriesByFolderId={{}}
      folders={[externalFolder('folder-1', '/library/1act')]}
      isExternalViewOpen={false}
      onOpenExternalSelection={vi.fn()}
      selection={{ kind: 'root' }}
    />
  );

  const row = screen.getByRole('treeitem', { name: /1act/i });
  expect(row).toHaveTextContent('1');
  expect(row.querySelector('[aria-label="External folder"]')).toBeInTheDocument();
});

it('hides the external folder section when external folders are disabled', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.externalFoldersEnabled, 'false');

  renderWithLocalization(
    <ExternalLibrarySection
      entriesByFolderId={{}}
      folders={[externalFolder('folder-1', '/library/1act')]}
      isExternalViewOpen={false}
      onOpenExternalLibrarySettings={vi.fn()}
      onOpenExternalSelection={vi.fn()}
      selection={{ kind: 'root' }}
    />
  );

  expect(screen.queryByRole('treeitem', { name: 'External' })).toBeNull();
  expect(screen.queryByRole('treeitem', { name: /1act/i })).toBeNull();
});
