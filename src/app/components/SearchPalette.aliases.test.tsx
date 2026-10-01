import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));
vi.mock('../../shared/platform/nodeSourceRuntimeRepository', () => ({ loadRuntimeNodeSourceDetails: vi.fn().mockResolvedValue(null) }));
vi.mock('../../shared/platform/externalSearchRuntimeRepository', () => ({ loadRuntimeExternalSearchFolders: vi.fn().mockResolvedValue([]) }));
vi.mock('../../shared/platform/removedSourcesRuntimeRepository', () => ({
  loadRuntimeRemovedSources: vi.fn().mockResolvedValue({ entries: [], loadedAt: '' })
}));

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';

import { SearchPalette } from './SearchPalette';
import type { WorkspaceSearchResult } from './workspaceSearch';

function result(id: string, spelling: string): WorkspaceSearchResult {
  const query = spelling === 'disney' ? 'Disney' : '迪士尼';
  const match = { from: 0, query, to: query.length };
  return {
    aliasMatches: [{ excerpt: `${query} body`, externalMatch: null, nodeMatch: match, pdfMatch: null, spelling }],
    excerpt: `${query} body`, externalMatch: null, id, kind: 'node', matchedOriginal: spelling === 'disney',
    nodeMatch: match, pdfMatch: null, title: `${query} topic`, updatedAt: '2026-05-01T00:00:00.000Z'
  };
}

it('filters a complete search snapshot by spelling without starting another database search', async () => {
  window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
  const original = result('original', 'disney');
  const later = result('later', '迪士尼');
  let resolveBatch!: (value: { hasMore: boolean; results: WorkspaceSearchResult[] }) => void;
  const batch = new Promise<{ hasMore: boolean; results: WorkspaceSearchResult[] }>((resolve) => { resolveBatch = resolve; });
  const invoke = vi.fn((command: string, args?: { spelling?: string | null }) => {
    if (command === 'search_workspace') return Promise.resolve({
      aliasSpellings: [{ key: 'disney', label: 'Disney' }, { key: '迪士尼', label: '迪士尼' }],
      hasMore: false, results: [original], revision: 1, snapshotId: 'snapshot-1'
    });
    if (command === 'load_workspace_search_batch' && args?.spelling === '迪士尼') return batch;
    if (command === 'load_workspace_search_batch') return Promise.resolve({
      hasMore: false, results: args?.spelling === '迪士尼' ? [later] : [original]
    });
    return Promise.resolve(null);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  renderWithLocalization(<SearchPalette isOpen nodeOrder={[]} nodesById={{}}
    onClose={() => undefined} onOpenResult={() => undefined} trashedNodeIds={[]} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), { target: { value: 'Disney' } });
  await waitFor(() => expect(screen.getByRole('button', { name: /Disney topic/ })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '迪士尼' }));
  expect(screen.getByRole('status')).toHaveTextContent('Searching…');
  expect(screen.queryByText('No matching results')).not.toBeInTheDocument();
  await act(async () => resolveBatch({ hasMore: false, results: [later] }));
  await waitFor(() => expect(screen.getByRole('button', { name: /迪士尼 topic/ })).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /Disney topic/ })).not.toBeInTheDocument();
  expect(invoke.mock.calls.filter(([command]) => command === 'search_workspace')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /Disney topic/ })).toBeInTheDocument());
  expect(invoke.mock.calls.filter(([command]) => command === 'search_workspace')).toHaveLength(1);
});
