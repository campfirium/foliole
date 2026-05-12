import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadRuntimeRemovedSources: vi.fn(),
  restoreRuntimeRemovedSource: vi.fn()
}));

vi.mock('../../shared/platform/removedSourcesRuntimeRepository', () => ({
  loadRuntimeRemovedSources: mocks.loadRuntimeRemovedSources,
  restoreRuntimeRemovedSource: mocks.restoreRuntimeRemovedSource
}));

import { RemovedSourcesPanel } from './RemovedSourcesPanel';

function createRemovedSource(overrides: Partial<{
  contentPreview: string | null;
  firstSeenAt: string;
  hasSourceUpdate: boolean;
  id: string;
  lastImportedAt: string | null;
  lastNodeId: string | null;
  lastSeenAt: string;
  ruleId: string;
  sourcePath: string;
  title: string;
}> = {}) {
  return {
    contentPreview: 'Preview text',
    firstSeenAt: '2026-05-12T00:00:00.000Z',
    hasSourceUpdate: false,
    id: 'rule-1:/Readwise/Alpha.md',
    lastImportedAt: '2026-05-12T00:00:00.000Z',
    lastNodeId: 'topic-old',
    lastSeenAt: '2026-05-12T00:00:00.000Z',
    ruleId: 'rule-1',
    sourcePath: '/Readwise/Alpha.md',
    title: 'Alpha Removed',
    ...overrides
  };
}

beforeEach(() => {
  mocks.loadRuntimeRemovedSources.mockReset();
  mocks.restoreRuntimeRemovedSource.mockReset();
});

it('uses the standard topic list surface for Removed sources', async () => {
  mocks.loadRuntimeRemovedSources.mockResolvedValue({
    entries: [createRemovedSource()],
    loadedAt: '2026-05-12T00:00:00.000Z'
  });

  render(<RemovedSourcesPanel />);

  expect(await screen.findByRole('complementary', { name: 'Current folder contents' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open title search' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Alpha Removed /Readwise/Alpha.md' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Import to Foliole' })).toBeNull();
  expect(screen.queryByText('No import selected')).toBeNull();
});

it('filters Removed rows with the standard title search overlay', async () => {
  mocks.loadRuntimeRemovedSources.mockResolvedValue({
    entries: [
      createRemovedSource(),
      createRemovedSource({ id: 'rule-1:/Readwise/Beta.md', sourcePath: '/Readwise/Beta.md', title: 'Beta Removed' })
    ],
    loadedAt: '2026-05-12T00:00:00.000Z'
  });

  render(<RemovedSourcesPanel />);

  expect(await screen.findByRole('treeitem', { name: 'Alpha Removed /Readwise/Alpha.md' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topic titles' }), { target: { value: 'Beta' } });

  await waitFor(() => expect(screen.queryByRole('treeitem', { name: 'Alpha Removed /Readwise/Alpha.md' })).toBeNull());
  expect(screen.getByRole('treeitem', { name: 'Beta Removed /Readwise/Beta.md' })).toBeInTheDocument();
});
