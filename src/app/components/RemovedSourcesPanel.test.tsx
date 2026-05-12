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
  content: string | null;
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
    content: 'Full source text',
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
  expect(screen.getByRole('button', { name: 'Sort list by Date modified' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Collapse all topics' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Readwise' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Alpha Removed' })).toBeInTheDocument();
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

  expect(await screen.findByRole('treeitem', { name: 'Alpha Removed' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topic titles' }), { target: { value: 'Beta' } });

  await waitFor(() => expect(screen.queryByRole('treeitem', { name: 'Alpha Removed' })).toBeNull());
  expect(screen.getByRole('treeitem', { name: 'Beta Removed' })).toBeInTheDocument();
});

it('collapses and expands Removed source folders with the standard list control', async () => {
  mocks.loadRuntimeRemovedSources.mockResolvedValue({
    entries: [
      createRemovedSource(),
      createRemovedSource({ id: 'rule-1:/Readwise/Beta.md', sourcePath: '/Readwise/Beta.md', title: 'Beta Removed' })
    ],
    loadedAt: '2026-05-12T00:00:00.000Z'
  });

  render(<RemovedSourcesPanel />);

  expect(await screen.findByRole('treeitem', { name: 'Alpha Removed' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse all topics' }));

  await waitFor(() => expect(screen.queryByRole('treeitem', { name: 'Alpha Removed' })).toBeNull());
  expect(screen.getByRole('treeitem', { name: 'Readwise' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Expand all topics' }));

  expect(await screen.findByRole('treeitem', { name: 'Beta Removed' })).toBeInTheDocument();
});

it('imports a Removed source from the row context menu', async () => {
  const onSelectNode = vi.fn();
  const entry = createRemovedSource();
  mocks.loadRuntimeRemovedSources.mockResolvedValue({
    entries: [entry],
    loadedAt: '2026-05-12T00:00:00.000Z'
  });
  mocks.restoreRuntimeRemovedSource.mockResolvedValue({
    node_id: 'topic-new',
    restored_at: '2026-05-12T00:00:01.000Z',
    status: 'restored'
  });

  render(<RemovedSourcesPanel onSelectNode={onSelectNode} />);

  fireEvent.contextMenu(await screen.findByRole('treeitem', { name: 'Alpha Removed' }), {
    clientX: 160,
    clientY: 120
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Import to Foliole' }));

  await waitFor(() => expect(mocks.restoreRuntimeRemovedSource).toHaveBeenCalledWith(entry));
  expect(onSelectNode).toHaveBeenCalledWith('topic-new');
});
