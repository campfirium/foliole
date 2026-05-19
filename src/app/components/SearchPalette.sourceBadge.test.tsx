import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));
vi.mock('../../shared/platform/nodeSourceRuntimeRepository', () => ({ loadRuntimeNodeSourceDetails: vi.fn() }));
vi.mock('../../shared/platform/externalSearchRuntimeRepository', () => ({ loadRuntimeExternalSearchFolders: vi.fn().mockResolvedValue([]) }));
vi.mock('../../shared/platform/removedSourcesRuntimeRepository', () => ({
  loadRuntimeRemovedSources: vi.fn().mockResolvedValue({ entries: [], loadedAt: '2026-05-13T00:00:00.000Z' })
}));

import { loadRuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceRuntimeRepository';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';

import { SearchPalette } from './SearchPalette';
import type { WorkspaceSearchResult } from './workspaceSearch';

function createWatchedSourceDetails(nodeId: string) {
  return {
    importRuns: [],
    importSource: null,
    inheritedFromParent: false,
    keepImportItem: {
      firstSeenAt: '2026-03-30T00:00:00.000Z',
      hasSourceUpdate: false,
      highlightPath: null,
      keepState: 'enabled' as const,
      lastImportedAt: '2026-03-30T00:00:00.000Z',
      lastSeenAt: '2026-03-30T00:00:00.000Z',
      lastStatus: 'imported' as const,
      localNodeState: 'active' as const,
      primaryPath: '/tmp/Watched Articles',
      ruleId: 'rule-1',
      ruleLabel: 'Articles Watch',
      resolvedSourcePath: null,
      sourceMtimeMs: 1,
      sourcePath: '/tmp/Watched Articles/item.md',
      sourceSizeBytes: 10,
      sourceState: 'present' as const,
      sourceType: 'generic' as const
    },
    pdfPageDimensions: [],
    sourceNodeId: nodeId
  };
}

it('shows a watched source badge on the right for matching results', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(
    vi.fn().mockResolvedValue([
      {
        externalMatch: null,
        excerpt: 'Page 13 · 这是一个测试片段',
        id: 'pdf-1',
        kind: 'pdf',
        nodeMatch: null,
        pdfMatch: {
          attachmentId: 'att-1',
          matchStart: 4,
          page: 13,
          pageTextLength: 12,
          query: '测试'
        },
        title: '测试文档.pdf',
        updatedAt: '2026-03-30T00:00:00.000Z'
      }
    ] satisfies WorkspaceSearchResult[])
  );
  vi.mocked(loadRuntimeNodeSourceDetails).mockResolvedValue(createWatchedSourceDetails('pdf-1'));

  render(
    <SearchPalette
      isOpen
      nodeOrder={['root', 'pdf-1']}
      nodesById={{
        'pdf-1': {
          createdAt: '2026-03-29T00:00:00.000Z',
          hasContent: true,
          hasReveal: false,
          id: 'pdf-1',
          parentNodeId: 'root',
          review: null,
          title: '测试文档.pdf',
          updatedAt: '2026-03-29T00:00:00.000Z'
        },
        root: {
          createdAt: '2026-03-29T00:00:00.000Z',
          hasContent: false,
          hasReveal: false,
          id: 'root',
          parentNodeId: null,
          review: null,
          title: 'Folder A',
          updatedAt: '2026-03-29T00:00:00.000Z'
        }
      }}
      onClose={() => undefined}
      onOpenResult={() => undefined}
      trashedNodeIds={[]}
    />
  );

  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), {
    target: { value: '测试' }
  });

  await waitFor(() => expect(screen.getByText('Articles Watch')).toBeInTheDocument());
  expect(screen.getByText('Folder A')).toBeInTheDocument();
  expect(screen.getAllByText('测试').some((node) => node.getAttribute('style')?.includes('var(--app-accent-color)'))).toBe(true);
});
