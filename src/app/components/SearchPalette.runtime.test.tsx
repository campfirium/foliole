import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));
vi.mock('../../shared/platform/nodeSourceRuntimeRepository', () => ({ loadRuntimeNodeSourceDetails: vi.fn().mockResolvedValue(null) }));
vi.mock('../../shared/platform/externalSearchRuntimeRepository', () => ({ loadRuntimeExternalSearchFolders: vi.fn().mockResolvedValue([]) }));
vi.mock('../../shared/platform/removedSourcesRuntimeRepository', () => ({
  loadRuntimeRemovedSources: vi.fn().mockResolvedValue({ entries: [], loadedAt: '2026-05-13T00:00:00.000Z' })
}));

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';

import { SearchPalette } from './SearchPalette';
import type { WorkspaceSearchResult } from './workspaceSearch';

const SEARCH_DEBOUNCE_MS = 400;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((nextResolve) => { resolve = nextResolve; }), resolve };
}

it('waits for a typing pause before running workspace search', async () => {
  window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
  vi.useFakeTimers();
  try {
    const runtimeInvoke = vi.fn().mockResolvedValue([]);
    vi.mocked(getRuntimeInvoke).mockReturnValue(runtimeInvoke);

    renderWithLocalization(
      <SearchPalette
        isOpen
        nodeOrder={['root']}
        nodesById={{ root: { id: 'root', parentNodeId: null, title: 'Folder A', hasContent: false, hasReveal: false, review: null, createdAt: '2026-03-29T00:00:00.000Z', updatedAt: '2026-03-29T00:00:00.000Z' } }}
        onClose={() => undefined}
        onOpenResult={() => undefined}
        trashedNodeIds={[]}
      />
    );

    const input = screen.getByRole('textbox', { name: 'Search workspace' });
    fireEvent.change(input, { target: { value: 'la' } });
    fireEvent.change(input, { target: { value: 'launch' } });

    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(runtimeInvoke).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(runtimeInvoke).toHaveBeenCalledTimes(1);
    expect(runtimeInvoke).toHaveBeenCalledWith(expect.any(String), { query: 'launch' });
  } finally {
    vi.useRealTimers();
  }
});

it('clears stale runtime results immediately when the query changes', async () => {
  window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
  const firstSearch = createDeferred<WorkspaceSearchResult[]>();
  const secondSearch = createDeferred<WorkspaceSearchResult[]>();
  vi.mocked(getRuntimeInvoke).mockReturnValue(
    vi.fn().mockImplementation((_command: string, args: { query: string }) => {
      if (args.query === '确定信噪比') return firstSearch.promise;
      if (args.query === '测试') return secondSearch.promise;
      return Promise.resolve([]);
    })
  );

  renderWithLocalization(
    <SearchPalette
      isOpen
      nodeOrder={['root']}
      nodesById={{ root: { id: 'root', parentNodeId: null, title: 'Folder A', hasContent: false, hasReveal: false, review: null, createdAt: '2026-03-29T00:00:00.000Z', updatedAt: '2026-03-29T00:00:00.000Z' } }}
      onClose={() => undefined}
      onOpenResult={() => undefined}
      trashedNodeIds={[]}
    />
  );

  expect(screen.getByRole('dialog', { name: 'Workspace search' })).toHaveAttribute('aria-modal', 'true');
  const input = screen.getByRole('textbox', { name: 'Search workspace' });
  fireEvent.change(input, { target: { value: '确定信噪比' } });
  firstSearch.resolve([{ externalMatch: null, id: 'pdf-1', title: 'SuperMemoGuru 学习的乐趣.pdf', excerpt: 'Page 13 · ...Search for ExtraTerrestrial Intelligence 的缩写。', kind: 'pdf', nodeMatch: null, pdfMatch: { attachmentId: 'att-1', matchStart: 32, page: 13, pageTextLength: 300, query: 'ce' }, updatedAt: '2026-03-30T00:00:00.000Z' }]);

  await waitFor(() => expect(screen.getByRole('button', { name: /SuperMemoGuru 学习的乐趣\.pdf/i })).toBeInTheDocument());
  fireEvent.change(input, { target: { value: '测试' } });
  await waitFor(() => expect(screen.queryByRole('button', { name: /SuperMemoGuru 学习的乐趣\.pdf/i })).not.toBeInTheDocument());
  secondSearch.resolve([]);
  await waitFor(() => expect(screen.getByText('No matching results')).toBeInTheDocument());
});

it('shows a search error instead of an empty result when runtime search fails', async () => {
  window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockRejectedValue(new Error('search failed')));

  renderWithLocalization(
    <SearchPalette
      isOpen
      nodeOrder={['root']}
      nodesById={{ root: { id: 'root', parentNodeId: null, title: 'Folder A', hasContent: false, hasReveal: false, review: null, createdAt: '2026-03-29T00:00:00.000Z', updatedAt: '2026-03-29T00:00:00.000Z' } }}
      onClose={() => undefined}
      onOpenResult={() => undefined}
      trashedNodeIds={[]}
    />
  );

  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), { target: { value: 'missing' } });

  await waitFor(() => {
    expect(screen.getByText('Search is unavailable. Try again in a moment.')).toBeInTheDocument();
  });
  expect(screen.queryByText('No matching results')).not.toBeInTheDocument();
});
