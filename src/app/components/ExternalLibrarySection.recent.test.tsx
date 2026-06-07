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

beforeEach(() => {
  window.localStorage.clear();
});

it('keeps Recent above manually ordered external folders without a special trailing icon', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.externalLibraryFolderOrder,
    JSON.stringify([
      { folderPath: 'library/2think', id: 'folder-2' },
      { folderPath: 'recent', id: 'opened-external-documents' },
      { folderPath: 'library/1act', id: 'folder-1' }
    ])
  );

  renderWithLocalization(
    <ExternalLibrarySection
      entriesByFolderId={{ 'opened-external-documents': [] }}
      folders={[
        externalFolder('folder-1', '/library/1act'),
        externalFolder('folder-2', '/library/2think'),
        externalFolder('opened-external-documents', 'Recent')
      ]}
      isExternalViewOpen={false}
      onOpenExternalSelection={vi.fn()}
      selection={{ kind: 'root' }}
    />
  );

  expect(screen.getAllByRole('treeitem').map((row) => row.textContent)).toEqual([
    expect.stringContaining('Recent'),
    expect.stringContaining('2think'),
    expect.stringContaining('1act')
  ]);
  expect(screen.getByRole('treeitem', { name: /^Recent$/i }).querySelector('.lucide-history')).toBeNull();
  expect(screen.getByRole('treeitem', { name: /^Recent$/i }).querySelector('[aria-label="External folder"]')).toBeNull();
});

it('shows recent files as one folder and compacts single path chains below it', () => {
  renderWithLocalization(
    <ExternalLibrarySection
      entriesByFolderId={{
        'opened-external-documents': [{
          absolutePath: 'D:/T/test/a.md',
          extension: 'md',
          fileName: 'a.md',
          folderId: 'opened-external-documents',
          folderPath: 'Recent',
          modifiedAt: '2026-04-21T00:00:00.000Z',
          openingText: 'Alpha opening',
          relativePath: 'D:/T/test/a.md',
          title: 'Alpha'
        }]
      }}
      folders={[externalFolder('opened-external-documents', 'Recent')]}
      isExternalViewOpen={false}
      onOpenExternalSelection={vi.fn()}
      selection={{ kind: 'root' }}
    />
  );

  fireEvent.keyDown(screen.getByRole('treeitem', { name: /Recent/i }), { key: 'ArrowRight' });

  expect(screen.getByRole('treeitem', { name: /D › T › test/i })).toHaveAttribute('aria-level', '2');
  expect(screen.getByRole('treeitem', { name: /D › T › test/i }).querySelector('[data-node-tree-chevron-placeholder="true"]')).toBeNull();
  expect(screen.queryByRole('treeitem', { name: /^D:$/i })).toBeNull();
  expect(screen.queryByRole('treeitem', { name: /^T$/i })).toBeNull();
});

it('keeps compact path rows eligible for the truncated text tooltip', () => {
  const scrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 360 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 80 });
  const longPath = 'D:/very-long-workspace-name/research-notes/experiments';
  const displayPath = 'D › very-long-workspace-name › research-notes › experiments';

  try {
    renderWithLocalization(
      <ExternalLibrarySection
        entriesByFolderId={{
          'opened-external-documents': [{
            absolutePath: `${longPath}/a.md`,
            extension: 'md',
            fileName: 'a.md',
            folderId: 'opened-external-documents',
            folderPath: 'Recent',
            modifiedAt: '2026-04-21T00:00:00.000Z',
            openingText: 'Alpha opening',
            relativePath: `${longPath}/a.md`,
            title: 'Alpha'
          }]
        }}
        folders={[externalFolder('opened-external-documents', 'Recent')]}
        isExternalViewOpen={false}
        onOpenExternalSelection={vi.fn()}
        selection={{ kind: 'root' }}
      />
    );

    fireEvent.keyDown(screen.getByRole('treeitem', { name: /Recent/i }), { key: 'ArrowRight' });

    expect(screen.getByText(displayPath)).toHaveAttribute('data-truncated-text-tooltip-trigger', 'true');
  } finally {
    if (scrollWidth) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scrollWidth);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth');
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
    else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  }
});
