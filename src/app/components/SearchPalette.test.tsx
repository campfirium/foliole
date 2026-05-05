import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

import { getRuntimeInvoke } from '../../shared/platform/bridge';

import { SearchPalette } from './SearchPalette';
import type { WorkspaceSearchResult } from './workspaceSearch';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createSearchInvoke() {
  return vi.fn().mockImplementation((command: string) => {
    if (command !== 'search_workspace') {
      return Promise.resolve(null);
    }
    return Promise.resolve([
      {
        id: 'node-2',
        title: 'Atlas note',
        excerpt: '...launch checklist...',
        kind: 'node',
        nodeMatch: {
          from: 12,
          query: 'launch',
          to: 18
        },
        pdfMatch: null,
        updatedAt: '2026-03-30T00:00:00.000Z'
      }
    ]);
  });
}

function renderSearchPalette() {
  render(
    <SearchPalette
      isOpen
      nodeOrder={['node-1', 'node-2']}
      nodesById={{
        'node-1': {
          id: 'node-1',
          parentNodeId: null,
          title: 'Home',
          hasContent: false,
          hasReveal: false,
          review: null,
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z'
        },
        'node-2': {
          id: 'node-2',
          parentNodeId: null,
          title: 'Atlas note',
          hasContent: true,
          hasReveal: false,
          review: null,
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z'
        }
      }}
      onClose={() => undefined}
      onOpenResult={() => undefined}
      trashedNodeIds={[]}
    />
  );
}

it('loads search results from runtime without renderer content mirrors', async () => {
  const invoke = createSearchInvoke();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  renderSearchPalette();

  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), {
    target: { value: 'launch' }
  });

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Atlas note/i })).toBeInTheDocument();
  });
  expect(screen.getByText('...launch checklist...')).toBeInTheDocument();
  expect(invoke).toHaveBeenCalledWith('search_workspace', { query: 'launch' });
});

it('clears stale runtime results immediately when the query changes', async () => {
  const firstSearch = createDeferred<WorkspaceSearchResult[]>();
  const secondSearch = createDeferred<WorkspaceSearchResult[]>();
  const invoke = vi.fn().mockImplementation((_command: string, args: { query: string }) => {
    if (args.query === '确定信噪比') {
      return firstSearch.promise;
    }
    if (args.query === '测试') {
      return secondSearch.promise;
    }
    return Promise.resolve([]);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  renderSearchPalette();

  const input = screen.getByRole('textbox', { name: 'Search workspace' });
  fireEvent.change(input, { target: { value: '确定信噪比' } });
  firstSearch.resolve([
    {
      id: 'pdf-1',
      title: 'SuperMemoGuru 学习的乐趣.pdf',
      excerpt: 'Page 13 · ...Search for ExtraTerrestrial Intelligence 的缩写。',
      kind: 'pdf',
      nodeMatch: null,
      pdfMatch: {
        attachmentId: 'att-1',
        matchStart: 32,
        page: 13,
        pageTextLength: 300,
        query: 'ce'
      },
      updatedAt: '2026-03-30T00:00:00.000Z'
    }
  ]);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /SuperMemoGuru 学习的乐趣\.pdf/i })).toBeInTheDocument();
  });

  fireEvent.change(input, { target: { value: '测试' } });

  await waitFor(() => {
    expect(screen.queryByRole('button', { name: /SuperMemoGuru 学习的乐趣\.pdf/i })).not.toBeInTheDocument();
  });

  secondSearch.resolve([]);
  await waitFor(() => {
    expect(screen.getByText('No matching notes')).toBeInTheDocument();
  });
});
