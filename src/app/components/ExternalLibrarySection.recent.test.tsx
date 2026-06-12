import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getStoredAppLocale } from '../../shared/localization/appLanguage';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { preloadTranslationCatalog } from '../../shared/localization/translations';

import { ExternalLibrarySection } from './ExternalLibrarySection';

beforeAll(() => preloadTranslationCatalog(getStoredAppLocale()));

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

it('keeps Opened above manually ordered external folders without a special trailing icon', () => {
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
    expect.stringContaining('Opened'),
    expect.stringContaining('2think'),
    expect.stringContaining('1act')
  ]);
  const openedRow = screen.getByRole('treeitem', { name: /^Opened$/i });
  expect(openedRow.querySelector('.lucide-square-pen')).toBeInTheDocument();
  expect(openedRow.querySelector('[aria-label="External folder"]')).toBeNull();
});

it('explains Opened as files opened from disk', async () => {
  renderWithLocalization(
    <ExternalLibrarySection
      entriesByFolderId={{ 'opened-external-documents': [] }}
      folders={[externalFolder('opened-external-documents', 'Recent')]}
      isExternalViewOpen={false}
      onOpenExternalSelection={vi.fn()}
      selection={{ kind: 'root' }}
    />
  );

  const openedLabel = screen.getByText('Opened');
  expect(openedLabel).toHaveAttribute('data-truncated-text-tooltip-trigger', 'true');
  fireEvent.pointerMove(openedLabel, { pointerType: 'mouse' });
  fireEvent.pointerEnter(openedLabel, { pointerType: 'mouse' });

  expect(await screen.findByRole('tooltip')).toHaveTextContent('Files opened from disk in Foliole.');
});

it('shows opened files as one folder and only keeps the last compact path segment below it', () => {
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

  fireEvent.keyDown(screen.getByRole('treeitem', { name: /Opened/i }), { key: 'ArrowRight' });

  expect(screen.getByRole('treeitem', { name: /^› test$/i })).toHaveAttribute('aria-level', '2');
  expect(screen.getByRole('treeitem', { name: /^› test$/i }).querySelector('[data-node-tree-chevron-placeholder="true"]')).toBeNull();
  expect(screen.queryByRole('treeitem', { name: /D › T › test/i })).toBeNull();
  expect(screen.queryByRole('treeitem', { name: /^D:$/i })).toBeNull();
  expect(screen.queryByRole('treeitem', { name: /^T$/i })).toBeNull();
});

it('shows the full compact path in the tooltip text for opened file path rows', async () => {
  const scrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 80 });
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

    fireEvent.keyDown(screen.getByRole('treeitem', { name: /Opened/i }), { key: 'ArrowRight' });

    const pathLabel = screen.getByText('› experiments');
    expect(pathLabel).toHaveAttribute('data-truncated-text-tooltip-trigger', 'true');
    fireEvent.pointerMove(pathLabel, { pointerType: 'mouse' });
    fireEvent.pointerEnter(pathLabel, { pointerType: 'mouse' });
    expect(await screen.findByRole('tooltip')).toHaveTextContent(displayPath);
  } finally {
    if (scrollWidth) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scrollWidth);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth');
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
    else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  }
});
