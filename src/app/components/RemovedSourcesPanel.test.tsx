import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import type { RuntimeRemovedSourceEntry } from '../../shared/platform/removedSourcesRuntimeRepository';

const mocks = vi.hoisted(() => ({
  cachedRemovedSources: {
    entries: [] as RuntimeRemovedSourceEntry[],
    loadedAt: ''
  },
  getCachedRuntimeRemovedSources: vi.fn(),
  loadRuntimeRemovedSources: vi.fn(),
  refreshRuntimeRemovedSources: vi.fn(),
  removedSourcesListeners: new Set<() => void>(),
  restoreRuntimeRemovedSource: vi.fn()
}));

vi.mock('../../shared/platform/removedSourcesRuntimeRepository', () => ({
  getCachedRuntimeRemovedSources: mocks.getCachedRuntimeRemovedSources,
  loadRuntimeRemovedSources: mocks.loadRuntimeRemovedSources,
  refreshRuntimeRemovedSources: mocks.refreshRuntimeRemovedSources,
  subscribeRuntimeRemovedSources: (listener: () => void) => {
    mocks.removedSourcesListeners.add(listener);
    return () => mocks.removedSourcesListeners.delete(listener);
  },
  restoreRuntimeRemovedSource: mocks.restoreRuntimeRemovedSource
}));

import { RemovedSourcesPanel } from './RemovedSourcesPanel';

function createRemovedSource(overrides: Partial<{
  content: string | null;
  contentPreview: string | null;
  deletedAt: string;
  firstSeenAt: string;
  hasSourceUpdate: boolean;
  id: string;
  lastImportedAt: string | null;
  lastNodeId: string | null;
  ruleId: string;
  sourcePath: string;
  title: string;
}> = {}) {
  return {
    content: 'Full source text',
    contentPreview: 'Preview text',
    deletedAt: '2026-05-12T00:00:00.000Z',
    firstSeenAt: '2026-05-12T00:00:00.000Z',
    hasSourceUpdate: false,
    id: 'rule-1:/Readwise/Alpha.md',
    lastImportedAt: '2026-05-12T00:00:00.000Z',
    lastNodeId: 'topic-old',
    ruleId: 'rule-1',
    sourcePath: '/Readwise/Alpha.md',
    title: 'Alpha Removed',
    ...overrides
  };
}

beforeEach(() => {
  mocks.cachedRemovedSources = {
    entries: [] as RuntimeRemovedSourceEntry[],
    loadedAt: ''
  };
  mocks.removedSourcesListeners.clear();
  mocks.getCachedRuntimeRemovedSources.mockReset();
  mocks.getCachedRuntimeRemovedSources.mockImplementation(() => mocks.cachedRemovedSources);
  mocks.loadRuntimeRemovedSources.mockReset();
  mocks.refreshRuntimeRemovedSources.mockReset();
  mocks.restoreRuntimeRemovedSource.mockReset();
});

function mockRemovedSourcesLoad(result: ReturnType<typeof createRemovedSourcesResult>) {
  mocks.loadRuntimeRemovedSources.mockImplementation(async () => {
    mocks.cachedRemovedSources = result;
    mocks.removedSourcesListeners.forEach((listener) => listener());
    return result;
  });
  mocks.refreshRuntimeRemovedSources.mockImplementation(async () => {
    mocks.cachedRemovedSources = result;
    mocks.removedSourcesListeners.forEach((listener) => listener());
    return result;
  });
}

function createRemovedSourcesResult(entries: RuntimeRemovedSourceEntry[]) {
  return {
    entries,
    loadedAt: '2026-05-12T00:00:00.000Z'
  };
}

it('uses the standard topic list surface for Removed sources', async () => {
  mockRemovedSourcesLoad(createRemovedSourcesResult([createRemovedSource()]));

  renderWithLocalization(<RemovedSourcesPanel />);

  expect(await screen.findByRole('complementary', { name: 'Current folder contents' })).toBeInTheDocument();
  expect(screen.getByText('List deleted topics with linked sources.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open title search' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Sort list by Date removed' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Collapse all topics' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Readwise' })).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: 'Alpha Removed' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Re-import to Foliole' })).toBeNull();
  expect(screen.queryByText('No import selected')).toBeNull();
});

it('keeps the standard list surface blank while Removed sources load', () => {
  mocks.loadRuntimeRemovedSources.mockReturnValue(new Promise(() => undefined));

  renderWithLocalization(<RemovedSourcesPanel />);

  expect(screen.getByRole('complementary', { name: 'Current folder contents' })).toBeInTheDocument();
  expect(screen.getByText('List deleted topics with linked sources.')).toBeInTheDocument();
  expect(screen.queryByText('Preparing Removed')).toBeNull();
  expect(screen.queryByText('No removed topics')).toBeNull();
});

it('collapses and expands Removed source folders with the standard list control', async () => {
  mockRemovedSourcesLoad(
    createRemovedSourcesResult([
      createRemovedSource(),
      createRemovedSource({ id: 'rule-1:/Readwise/Beta.md', sourcePath: '/Readwise/Beta.md', title: 'Beta Removed' })
    ])
  );

  renderWithLocalization(<RemovedSourcesPanel />);

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
  mockRemovedSourcesLoad(createRemovedSourcesResult([entry]));
  mocks.restoreRuntimeRemovedSource.mockResolvedValue({
    node_id: 'topic-new',
    restored_at: '2026-05-12T00:00:01.000Z',
    status: 'restored'
  });

  renderWithLocalization(<RemovedSourcesPanel onSelectNode={onSelectNode} />);

  fireEvent.contextMenu(await screen.findByRole('treeitem', { name: 'Alpha Removed' }), {
    clientX: 160,
    clientY: 120
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Re-import to Foliole' }));

  await waitFor(() => expect(mocks.restoreRuntimeRemovedSource).toHaveBeenCalledWith(entry));
  expect(onSelectNode).toHaveBeenCalledWith('topic-new');
});
