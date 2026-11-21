import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ExternalLibraryListPanel } from './ExternalLibraryListPanel';
import { sortExternalDocuments } from './workspaceContentSort';

vi.mock('./workspaceContentSort', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspaceContentSort')>();
  return { ...actual, sortExternalDocuments: vi.fn(actual.sortExternalDocuments) };
});

const folders = [
  {
    attachmentMode: 'document_relative_first_then_fixed_root' as const,
    attachmentRootPath: null,
    createdAt: '2026-04-21T00:00:00.000Z',
    documentCount: 2,
    excludedDirs: [],
    folderPath: '/library',
    id: 'folder-1',
    indexedAt: '2026-04-21T00:00:00.000Z',
    lastError: null,
    status: 'ready' as const,
    updatedAt: '2026-04-21T00:00:00.000Z'
  }
];

const entry = (name: string) => ({
  absolutePath: `/library/${name}.md`,
  extension: 'md' as const,
  fileName: `${name}.md`,
  folderId: 'folder-1',
  folderPath: '/library',
  modifiedAt: '2026-04-21T00:00:00.000Z',
  openingText: null,
  relativePath: `${name}.md`,
  title: name
});
const entriesByFolderId = { 'folder-1': [entry('beta'), entry('alpha')] };
const selection = { folderId: 'folder-1', kind: 'folder' as const };

// Hosts pass a fresh open callback on every render; the folder contents stay the same.
function Panel(props: { tick: number }) {
  return (
    <ExternalLibraryListPanel
      entriesByFolderId={entriesByFolderId}
      folders={folders}
      onOpenExternalSelection={() => props.tick}
      selection={selection}
    />
  );
}

describe('ExternalLibraryListPanel re-renders', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      APP_SETTINGS_STORAGE_KEYS.workspaceContentSort,
      JSON.stringify({ direction: 'asc', key: 'name' })
    );
    vi.mocked(sortExternalDocuments).mockClear();
  });

  it('sorts the external folder once while its contents and sort stay the same', () => {
    const view = renderWithLocalization(<Panel tick={0} />);
    const sortsAfterMount = vi.mocked(sortExternalDocuments).mock.calls.length;
    expect(sortsAfterMount).toBeGreaterThan(0);
    for (let tick = 1; tick <= 5; tick += 1) view.rerender(<Panel tick={tick} />);
    expect(sortExternalDocuments).toHaveBeenCalledTimes(sortsAfterMount);
  });
});
