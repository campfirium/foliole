import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));
vi.mock('../../shared/platform/nodeSourceRuntimeRepository', () => ({
  loadRuntimeNodeSourceDetails: vi.fn()
}));
vi.mock('../../shared/platform/externalSearchRuntimeRepository', () => ({
  loadRuntimeExternalSearchFolders: vi.fn()
}));

import { getRuntimeInvoke } from '../../shared/platform/bridge';
import { loadRuntimeExternalSearchFolders } from '../../shared/platform/externalSearchRuntimeRepository';
import { loadRuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceRuntimeRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { SearchPalette } from './SearchPalette';
import { openImportedExternalResult } from './searchPaletteImportResult';
import type { WorkspaceSearchResult } from './workspaceSearch';

function createNodeResult() {
  return {
    externalMatch: null,
    id: 'node-2',
    title: 'Atlas note',
    excerpt: '...launch checklist...',
    kind: 'node' as const,
    nodeMatch: {
      from: 12,
      query: 'launch',
      to: 18
    },
    pdfMatch: null,
    updatedAt: '2026-03-30T00:00:00.000Z'
  };
}

function renderSearchPalette() {
  render(
    <SearchPalette
      isOpen
      nodeOrder={['node-1', 'node-2', 'node-3']}
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
          parentNodeId: 'node-1',
          title: 'Atlas note',
          hasContent: true,
          hasReveal: false,
          review: null,
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z'
        },
        'node-3': {
          id: 'node-3',
          parentNodeId: 'node-2',
          title: 'Atlas highlight',
          hasContent: true,
          hasReveal: false,
          review: null,
          anchorLink: {
            kind: 'highlight',
            id: 'anchor-1'
          },
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
function renderPdfSearchPalette() {
  render(
    <SearchPalette
      isOpen
      nodeOrder={['root', 'pdf-1']}
      nodesById={{
        root: {
          id: 'root',
          parentNodeId: null,
          title: 'Folder A',
          hasContent: false,
          hasReveal: false,
          review: null,
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z'
        },
        'pdf-1': {
          id: 'pdf-1',
          parentNodeId: 'root',
          title: '测试文档.pdf',
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
      primaryPath: '/tmp/Watched Articles',
      ruleId: 'rule-1',
      ruleLabel: 'Articles Watch',
      resolvedSourcePath: null,
      sourceMtimeMs: 1,
      sourcePath: '/tmp/Watched Articles/item.md',
      sourceSizeBytes: 10,
      sourceType: 'generic' as const
    },
    pdfPageDimensions: [],
    sourceNodeId: nodeId
  };
}
it('renders search results as title context and path rows', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(
    vi.fn().mockResolvedValue(
      [
        createNodeResult(),
        {
          externalMatch: null,
          id: 'node-3',
          title: 'Atlas highlight',
          excerpt: '...launch highlight...',
          kind: 'node' as const,
          nodeMatch: {
            from: 3,
            query: 'launch',
            to: 9
          },
          pdfMatch: null,
          updatedAt: '2026-03-30T00:00:00.000Z'
        }
      ] satisfies WorkspaceSearchResult[]
    )
  );
  vi.mocked(loadRuntimeNodeSourceDetails).mockResolvedValue(null);
  vi.mocked(loadRuntimeExternalSearchFolders).mockResolvedValue([]);
  renderSearchPalette();

  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), {
    target: { value: 'launch' }
  });

  await waitFor(() => {
    expect(screen.getByText('Atlas note')).toBeInTheDocument();
  });
  expect(screen.getByText((_, element) => (element?.textContent ?? '') === '...launch checklist...')).toBeInTheDocument();
  expect(screen.getByText('Home')).toBeInTheDocument();
  expect(screen.getByText('Home / Atlas note')).toBeInTheDocument();
  const launchMatches = screen.getAllByText('launch');
  expect(launchMatches.every((node) => node.tagName === 'SPAN')).toBe(true);
  expect(launchMatches.every((node) => node.getAttribute('style')?.includes('var(--app-accent-color)'))).toBe(true);
  expect(screen.getByText('Highlight')).toBeInTheDocument();
  expect(screen.queryByText('Content')).not.toBeInTheDocument();
  expect(screen.queryByText('Title')).not.toBeInTheDocument();
  const resultButtons = screen.getAllByRole('button').filter((button) => button.getAttribute('aria-label') !== 'Search workspace');
  expect(resultButtons[0]).toHaveTextContent('Atlas note');
  expect(resultButtons[1]).toHaveTextContent('Atlas highlight');
});

it('shows a watched source badge on the right for matching results', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(
    vi.fn().mockResolvedValue([
      {
        externalMatch: null,
        id: 'pdf-1',
        title: '测试文档.pdf',
        excerpt: 'Page 13 · 这是一个测试片段',
        kind: 'pdf',
        nodeMatch: null,
        pdfMatch: {
          attachmentId: 'att-1',
          matchStart: 4,
          page: 13,
          pageTextLength: 12,
          query: '测试'
        },
        updatedAt: '2026-03-30T00:00:00.000Z'
      }
    ] satisfies WorkspaceSearchResult[])
  );
  vi.mocked(loadRuntimeNodeSourceDetails).mockResolvedValue(createWatchedSourceDetails('pdf-1'));
  vi.mocked(loadRuntimeExternalSearchFolders).mockResolvedValue([]);
  renderPdfSearchPalette();

  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), {
    target: { value: '测试' }
  });

  await waitFor(() => {
    expect(screen.getByText('Articles Watch')).toBeInTheDocument();
  });
  expect(screen.getByText('Folder A')).toBeInTheDocument();
  expect(screen.getAllByText('测试').some((node) => node.getAttribute('style')?.includes('var(--app-accent-color)'))).toBe(true);
});


it('rehydrates the workspace before opening an imported external result', async () => {
  const rehydrate = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue(undefined);
  const onOpenResult = vi.fn();
  const setExternalPreviewPath = vi.fn();

  await openImportedExternalResult(
    {
      content_fingerprint: 'content-1',
      degraded_reason: null,
      duplicate_semantic: 'new',
      failure_reason: null,
      import_id: 'import-1',
      imported_at: '2026-04-21T00:35:11.508Z',
      node_id: 'node-imported',
      provider: 'desktop_text_file',
      result_status: 'imported',
      source_fingerprint: 'source-1',
      source_kind: 'markdown',
      source_locator: '/tmp/topic.md',
      source_name: 'topic.md'
    },
    onOpenResult,
    setExternalPreviewPath
  );

  expect(setExternalPreviewPath).toHaveBeenCalledWith(null);
  expect(rehydrate).toHaveBeenCalledTimes(1);
  expect(onOpenResult).toHaveBeenCalledWith({
    excerpt: '',
    externalMatch: null,
    id: 'node-imported',
    kind: 'node',
    nodeMatch: null,
    pdfMatch: null,
    title: 'topic.md',
    updatedAt: '2026-04-21T00:35:11.508Z'
  });

  rehydrate.mockRestore();
});
