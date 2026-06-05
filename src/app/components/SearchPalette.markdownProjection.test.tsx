import { fireEvent, screen, waitFor } from '@testing-library/react';
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

function renderSearchPalette() {
  window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
  renderWithLocalization(
    <SearchPalette
      isOpen
      nodeOrder={['node-1', 'node-2']}
      nodesById={{
        'node-1': {
          createdAt: '2026-03-29T00:00:00.000Z',
          hasContent: false,
          hasReveal: false,
          id: 'node-1',
          parentNodeId: null,
          review: null,
          title: 'Home',
          updatedAt: '2026-03-29T00:00:00.000Z'
        },
        'node-2': {
          createdAt: '2026-03-29T00:00:00.000Z',
          hasContent: true,
          hasReveal: false,
          id: 'node-2',
          parentNodeId: 'node-1',
          review: null,
          title: 'Atlas note',
          updatedAt: '2026-03-29T00:00:00.000Z'
        }
      }}
      onClose={() => undefined}
      onOpenResult={() => undefined}
      trashedNodeIds={[]}
    />
  );
}

it('renders node search markdown as readable title and excerpt text', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(
    vi.fn().mockResolvedValue([
      {
        externalMatch: null,
        excerpt: '...## **launch** checklist...',
        id: 'node-2',
        kind: 'node',
        nodeMatch: { from: 0, query: 'launch', to: 6 },
        pdfMatch: null,
        title: '## **Atlas** note',
        updatedAt: '2026-03-30T00:00:00.000Z'
      }
    ] satisfies WorkspaceSearchResult[])
  );
  renderSearchPalette();

  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), {
    target: { value: 'launch' }
  });

  await waitFor(() => expect(screen.getByText('Atlas note')).toBeInTheDocument());
  expect(screen.getAllByText((_, element) => (element?.textContent ?? '') === '...launch checklist...').length).toBeGreaterThan(0);
  expect(screen.queryByText(/##|\*\*/)).not.toBeInTheDocument();
});

it('keeps markdown-symbol queries readable even when no display highlight remains', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(
    vi.fn().mockResolvedValue([
      {
        externalMatch: null,
        excerpt: '...**Atlas** launch...',
        id: 'node-2',
        kind: 'node',
        nodeMatch: { from: 0, query: '**', to: 2 },
        pdfMatch: null,
        title: '**Atlas** note',
        updatedAt: '2026-03-30T00:00:00.000Z'
      }
    ] satisfies WorkspaceSearchResult[])
  );
  renderSearchPalette();

  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), {
    target: { value: '**' }
  });

  await waitFor(() => expect(screen.getByText('Atlas note')).toBeInTheDocument());
  expect(screen.getAllByText((_, element) => (element?.textContent ?? '') === '...Atlas launch...').length).toBeGreaterThan(0);
  expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
});
