import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRuntimeInvoke: vi.fn(),
  loadRuntimeRemovedSources: vi.fn()
}));

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: mocks.getRuntimeInvoke
}));
vi.mock('../../shared/platform/nodeSourceRuntimeRepository', () => ({
  loadRuntimeNodeSourceDetails: vi.fn().mockResolvedValue(null)
}));
vi.mock('../../shared/platform/externalSearchRuntimeRepository', () => ({
  loadRuntimeExternalSearchFolders: vi.fn().mockResolvedValue([])
}));
vi.mock('../../shared/platform/removedSourcesRuntimeRepository', () => ({
  loadRuntimeRemovedSources: mocks.loadRuntimeRemovedSources
}));

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { SearchPalette } from './SearchPalette';
import { buildRemovedWorkspaceSearchResults } from './workspaceSearch';

function createRemovedSource() {
  return {
    content: 'Removed source body with launch checklist.',
    contentPreview: 'Removed source body with launch checklist.',
    deletedAt: '2026-05-12T00:00:00.000Z',
    firstSeenAt: '2026-05-12T00:00:00.000Z',
    hasSourceUpdate: false,
    id: 'rule-1:/Readwise/Removed.md',
    lastImportedAt: '2026-05-12T00:00:00.000Z',
    lastNodeId: 'topic-old',
    ruleId: 'rule-1',
    sourcePath: '/Readwise/Removed.md',
    title: 'Removed launch'
  };
}

function renderSearchPalette() {
  window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true');
  renderWithLocalization(
    <SearchPalette
      isOpen
      nodeOrder={['root']}
      nodesById={{
        root: {
          createdAt: '2026-03-29T00:00:00.000Z',
          hasContent: false,
          hasReveal: false,
          id: 'root',
          parentNodeId: null,
          review: null,
          title: 'Root',
          updatedAt: '2026-03-29T00:00:00.000Z'
        }
      }}
      onClose={() => undefined}
      onOpenResult={() => undefined}
      trashedNodeIds={[]}
    />
  );
}

it('includes Removed source matches in workspace search', async () => {
  const entry = createRemovedSource();
  mocks.getRuntimeInvoke.mockReturnValue(vi.fn().mockResolvedValue([]));
  mocks.loadRuntimeRemovedSources.mockResolvedValue({
    entries: [entry],
    loadedAt: '2026-05-13T00:00:00.000Z'
  });
  expect(buildRemovedWorkspaceSearchResults([entry], 'launch')).toHaveLength(1);

  renderSearchPalette();

  await Promise.resolve();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), {
    target: { value: 'launch' }
  });

  await waitFor(() => expect(mocks.loadRuntimeRemovedSources).toHaveBeenCalled());
  await expect(mocks.loadRuntimeRemovedSources.mock.results[0]?.value).resolves.toMatchObject({
    entries: [{ title: 'Removed launch' }]
  });
  expect(await screen.findByRole('button', { name: /Removed launch/ })).toBeInTheDocument();
  expect(screen.getAllByText('Removed').length).toBeGreaterThan(0);
  expect(screen.getByText('/Readwise/Removed.md')).toBeInTheDocument();
});
