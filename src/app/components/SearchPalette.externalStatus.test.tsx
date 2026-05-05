import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));
vi.mock('../../shared/platform/nodeSourceRuntimeRepository', () => ({
  loadRuntimeNodeSourceDetails: vi.fn().mockResolvedValue(null)
}));
vi.mock('../../shared/platform/externalSearchRuntimeRepository', () => ({
  loadRuntimeExternalSearchFolders: vi.fn()
}));

import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { loadRuntimeExternalSearchFolders } from '../../shared/platform/externalSearchRuntimeRepository';

import { SearchPalette } from './SearchPalette';
import type { WorkspaceSearchResult } from './workspaceSearch';

it('shows the external index status in the external results section header', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(
    vi.fn().mockResolvedValue([
      {
        excerpt: '...spaced repetition...',
        externalMatch: {
          absolutePath: '/tmp/external.md',
          folderId: 'folder-1',
          folderPath: '/tmp/library',
          query: 'spaced',
          relativePath: 'ir/external.md'
        },
        id: '/tmp/external.md',
        kind: 'external' as const,
        nodeMatch: null,
        pdfMatch: null,
        title: 'History of spaced repetition (print).md',
        updatedAt: '2026-04-21T00:00:00.000Z'
      }
    ] satisfies WorkspaceSearchResult[])
  );
  vi.mocked(loadRuntimeExternalSearchFolders).mockResolvedValue([
    {
      attachmentMode: 'document_relative_first_then_fixed_root',
      attachmentRootPath: '/tmp/assets',
      createdAt: '2026-04-21T00:00:00.000Z',
      documentCount: 10,
      excludedDirs: [],
      folderPath: '/tmp/library',
      id: 'folder-1',
      indexedAt: null,
      lastError: null,
      status: 'indexing',
      updatedAt: '2026-04-21T00:00:00.000Z'
    }
  ]);

  render(
    <SearchPalette
      isOpen
      nodeOrder={['root']}
      nodesById={{ root: { id: 'root', parentNodeId: null, title: 'Root', hasContent: false, hasReveal: false, review: null, createdAt: '2026-03-29T00:00:00.000Z', updatedAt: '2026-03-29T00:00:00.000Z' } }}
      onClose={() => undefined}
      onOpenResult={() => undefined}
      trashedNodeIds={[]}
    />
  );

  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), {
    target: { value: 'spaced' }
  });

  await waitFor(() => {
    expect(screen.getByText('External folders')).toBeInTheDocument();
  });
  expect(screen.getByText('Updating')).toBeInTheDocument();
});
