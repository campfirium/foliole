import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));
vi.mock('../../shared/platform/nodeSourceRuntimeRepository', () => ({
  loadRuntimeNodeSourceDetails: vi.fn()
}));
vi.mock('../../shared/platform/externalSearchRuntimeRepository', () => ({
  loadRuntimeExternalSearchFolders: vi.fn()
}));
vi.mock('../../shared/platform/externalLibraryBrowseRepository', () => ({
  loadExternalLibraryFolders: vi.fn()
}));

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { loadExternalLibraryFolders } from '../../shared/platform/externalLibraryBrowseRepository';
import { loadRuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceRuntimeRepository';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';

import { SearchPalette } from './SearchPalette';
import type { WorkspaceSearchResult } from './workspaceSearch';

function createExternalResult(): WorkspaceSearchResult {
  return {
    excerpt: 'External launch body',
    externalMatch: {
      absolutePath: '/tmp/library/topic.md',
      folderId: 'folder-1',
      folderPath: '/tmp/library',
      query: 'launch',
      relativePath: 'topic.md'
    },
    id: '/tmp/library/topic.md',
    kind: 'external',
    nodeMatch: null,
    pdfMatch: null,
    title: 'topic.md',
    updatedAt: '2026-04-21T00:00:00.000Z'
  };
}

function renderExternalSearchPalette(onOpenResult: (result: WorkspaceSearchResult, options?: { preview?: boolean }) => void) {
  window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue([createExternalResult()]));
  vi.mocked(loadRuntimeNodeSourceDetails).mockResolvedValue(null);
  vi.mocked(loadExternalLibraryFolders).mockResolvedValue([]);
  renderWithLocalization(
    <SearchPalette
      isOpen
      nodeOrder={[]}
      nodesById={{}}
      onClose={() => undefined}
      onOpenResult={onOpenResult}
      trashedNodeIds={[]}
    />
  );
}

it('uses the regular open action for external result clicks', async () => {
  const onOpenResult = vi.fn();
  renderExternalSearchPalette(onOpenResult);

  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), {
    target: { value: 'launch' }
  });

  const result = (await screen.findAllByText('topic.md'))[0]?.closest('button');
  if (!result) throw new Error('Expected external result button.');
  fireEvent.click(result);

  expect(onOpenResult).toHaveBeenCalledWith(createExternalResult(), { preview: false });
});

it('uses the preview action for shift-click and shift-enter on external results', async () => {
  const onOpenResult = vi.fn();
  renderExternalSearchPalette(onOpenResult);
  const input = screen.getByRole('textbox', { name: 'Search workspace' });

  fireEvent.change(input, { target: { value: 'launch' } });

  const result = (await screen.findAllByText('topic.md'))[0]?.closest('button');
  if (!result) throw new Error('Expected external result button.');
  fireEvent.click(result, { shiftKey: true });
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

  await waitFor(() => {
    expect(onOpenResult).toHaveBeenCalledTimes(2);
  });
  expect(onOpenResult).toHaveBeenNthCalledWith(1, createExternalResult(), { preview: true });
  expect(onOpenResult).toHaveBeenNthCalledWith(2, createExternalResult(), { preview: true });
});
