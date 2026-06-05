import type { ExternalDocumentPreviewLoadState } from './externalSearchPreviewState';

export const externalDocumentSurfaceFolders = [
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

export const externalDocumentSurfaceEntries = {
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

export function createExternalPreviewState(
  overrides: Partial<ExternalDocumentPreviewLoadState> = {}
): ExternalDocumentPreviewLoadState {
  return {
    error: null,
    isLoading: false,
    preview: null,
    retry: () => undefined,
    ...overrides
  };
}
