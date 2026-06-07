import { expect, it } from 'vitest';

import {
  buildExternalLibraryFolderBrowseState,
  resolveExternalFolderDisplayLabel,
  resolveReadwiseExternalChildLabel
} from './externalLibraryBrowseModel';

const folder = {
  attachmentMode: 'document_relative_first_then_fixed_root' as const,
  attachmentRootPath: null,
  createdAt: '2026-04-21T00:00:00.000Z',
  documentCount: 3,
  excludedDirs: [],
  folderPath: '/library/two think',
  id: 'folder-1',
  indexedAt: '2026-04-21T00:00:00.000Z',
  lastError: null,
  status: 'ready' as const,
  updatedAt: '2026-04-21T00:00:00.000Z'
};

const entries = [
  {
    absolutePath: '/library/two think/a.md',
    extension: 'md' as const,
    fileName: 'a.md',
    folderId: 'folder-1',
    folderPath: '/library/two think',
    modifiedAt: '2026-04-21T00:00:00.000Z',
    openingText: 'Alpha opening',
    relativePath: 'a.md',
    title: 'Alpha'
  },
  {
    absolutePath: '/library/two think/sub/b.md',
    extension: 'md' as const,
    fileName: 'b.md',
    folderId: 'folder-1',
    folderPath: '/library/two think',
    modifiedAt: '2026-04-21T00:00:00.000Z',
    openingText: 'Beta opening',
    relativePath: 'sub/b.md',
    title: 'Beta'
  },
  {
    absolutePath: '/library/two think/sub/deep/c.txt',
    extension: 'txt' as const,
    fileName: 'c.txt',
    folderId: 'folder-1',
    folderPath: '/library/two think',
    modifiedAt: '2026-04-21T00:00:00.000Z',
    openingText: 'Gamma opening',
    relativePath: 'sub/deep/c.txt',
    title: 'Gamma'
  }
];

it('keeps directories in the left tree model and returns all descendant documents for the selected folder', () => {
  const state = buildExternalLibraryFolderBrowseState(folder, entries, { folderId: 'folder-1', kind: 'folder' });

  expect(state.directoryNodes.map((node) => node.directoryPath)).toEqual(['sub', 'sub/deep']);
  expect(state.directoryNodes.map((node) => node.name)).toEqual(['sub', 'deep']);
  expect(state.documentItems.map((item) => item.relativePath)).toEqual(['a.md', 'sub/b.md', 'sub/deep/c.txt']);
});

it('compacts a single directory chain until the first useful branch point', () => {
  const state = buildExternalLibraryFolderBrowseState(folder, [
    {
      ...entries[0],
      absolutePath: 'D:/T/test/a.md',
      relativePath: 'D:/T/test/a.md'
    },
    {
      ...entries[1],
      absolutePath: 'D:/T/test/deep/b.md',
      relativePath: 'D:/T/test/deep/b.md'
    }
  ], { folderId: 'folder-1', kind: 'folder' });

  expect(state.directoryNodes.map((node) => [node.directoryPath, node.name, node.parentDirectoryPath])).toEqual([
    ['D:/T/test', 'D › T › test', null],
    ['D:/T/test/deep', 'deep', 'D:/T/test']
  ]);
});

it('keeps the branch point when opened documents spread across sibling directories', () => {
  const state = buildExternalLibraryFolderBrowseState(folder, [
    {
      ...entries[0],
      absolutePath: 'D:/T/test/a.md',
      relativePath: 'D:/T/test/a.md'
    },
    {
      ...entries[1],
      absolutePath: 'D:/T/draft/b.md',
      relativePath: 'D:/T/draft/b.md'
    }
  ], { folderId: 'folder-1', kind: 'folder' });

  expect(state.directoryNodes.map((node) => [node.directoryPath, node.name, node.parentDirectoryPath])).toEqual([
    ['D:/T', 'D › T', null],
    ['D:/T/draft', 'draft', 'D:/T'],
    ['D:/T/test', 'test', 'D:/T']
  ]);
});

it('returns all descendant documents for the selected directory instead of child directories', () => {
  const state = buildExternalLibraryFolderBrowseState(folder, entries, {
    directoryPath: 'sub',
    folderId: 'folder-1',
    kind: 'directory'
  });

  expect(state.selectedDirectoryPath).toBe('sub');
  expect(state.documentItems.map((item) => item.relativePath)).toEqual(['sub/b.md', 'sub/deep/c.txt']);
});

it('uses stable Readwise labels for managed external folders', () => {
  const folder = {
    folderPath: '/Readwise/Full Document Contents/Articles',
    id: 'readwise-reader-import-articles'
  };
  expect(resolveExternalFolderDisplayLabel(folder)).toBe('Readwise Articles');
  expect(resolveReadwiseExternalChildLabel(folder)).toBe('Articles');
});

it('uses a stable recent-files label even when cached rows still carry the old folder path', () => {
  expect(resolveExternalFolderDisplayLabel({
    folderPath: 'Opened in Foliole',
    id: 'opened-external-documents'
  })).toBe('Recent');
});
