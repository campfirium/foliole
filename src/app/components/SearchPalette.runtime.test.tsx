import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));
vi.mock('../../shared/platform/nodeSourceRuntimeRepository', () => ({ loadRuntimeNodeSourceDetails: vi.fn().mockResolvedValue(null) }));
vi.mock('../../shared/platform/externalSearchRuntimeRepository', () => ({ loadRuntimeExternalSearchFolders: vi.fn().mockResolvedValue([]) }));
const removedSourcesMock = vi.hoisted(() => vi.fn().mockResolvedValue({ entries: [], loadedAt: '2026-05-13T00:00:00.000Z' }));
vi.mock('../../shared/platform/removedSourcesRuntimeRepository', () => ({ loadRuntimeRemovedSources: removedSourcesMock }));

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';

import { SearchPalette } from './SearchPalette';
import type { WorkspaceSearchResult } from './workspaceSearch';

const SEARCH_DEBOUNCE_MS = 400;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((nextResolve) => { resolve = nextResolve; }), resolve };
}

function createSearchResult(input: {
  id: string;
  kind?: WorkspaceSearchResult['kind'];
  sourceKind?: 'external' | 'opened';
  title: string;
}): WorkspaceSearchResult {
  const kind = input.kind ?? 'node';
  return {
    externalMatch: kind === 'external'
      ? {
          absolutePath: `/library/${input.id}.md`,
          folderId: input.sourceKind === 'opened' ? 'opened-external-documents' : 'folder-1',
          folderPath: input.sourceKind === 'opened' ? 'Local' : '/library',
          query: 'launch',
          relativePath: `${input.id}.md`,
          sourceKind: input.sourceKind ?? 'external'
        }
      : null,
    excerpt: `${input.title} excerpt`,
    id: input.id,
    kind,
    nodeMatch: null,
    pdfMatch: null,
    title: input.title,
    updatedAt: '2026-03-30T00:00:00.000Z'
  };
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

it('orders internal, anchored, removed, opened, and external results in stable buckets', async () => {
  window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue([
    createSearchResult({ id: 'external-result', kind: 'external', sourceKind: 'external', title: 'External result' }),
    createSearchResult({ id: 'opened-result', kind: 'external', sourceKind: 'opened', title: 'Opened result' }),
    createSearchResult({ id: 'anchored-result', title: 'Anchored result' }),
    createSearchResult({ id: 'regular-result', title: 'Regular result' })
  ]));
  removedSourcesMock.mockResolvedValueOnce({
    entries: [{
      content: 'Removed launch body',
      contentPreview: 'Removed launch body',
      deletedAt: '2026-05-12T00:00:00.000Z',
      firstSeenAt: '2026-05-12T00:00:00.000Z',
      hasSourceUpdate: false,
      id: 'removed-result',
      lastImportedAt: '2026-05-12T00:00:00.000Z',
      lastNodeId: 'topic-old',
      ruleId: 'rule-1',
      sourcePath: '/Readwise/Removed.md',
      title: 'Removed result'
    }],
    loadedAt: '2026-05-13T00:00:00.000Z'
  });

  renderWithLocalization(
    <SearchPalette
      isOpen
      nodeOrder={['root']}
      nodesById={{
        'anchored-result': {
          anchorLink: { id: 'anchor-1', kind: 'cloze' },
          createdAt: '2026-03-29T00:00:00.000Z',
          hasContent: true,
          hasReveal: false,
          id: 'anchored-result',
          parentNodeId: 'root',
          review: null,
          title: 'Anchored result',
          updatedAt: '2026-03-29T00:00:00.000Z'
        },
        root: { id: 'root', parentNodeId: null, title: 'Folder A', hasContent: false, hasReveal: false, review: null, createdAt: '2026-03-29T00:00:00.000Z', updatedAt: '2026-03-29T00:00:00.000Z' }
      }}
      onClose={() => undefined}
      onOpenResult={() => undefined}
      trashedNodeIds={[]}
    />
  );

  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), { target: { value: 'launch' } });

  await waitFor(() => expect(screen.getByRole('button', { name: /External result/ })).toBeInTheDocument());
  const labels = screen.getAllByRole('button').map((button) => button.textContent ?? '').join('\n');
  expect(labels.indexOf('Regular result')).toBeLessThan(labels.indexOf('Anchored result'));
  expect(labels.indexOf('Anchored result')).toBeLessThan(labels.indexOf('Removed result'));
  expect(labels.indexOf('Removed result')).toBeLessThan(labels.indexOf('Opened result'));
  expect(labels.indexOf('Opened result')).toBeLessThan(labels.indexOf('External result'));
});
