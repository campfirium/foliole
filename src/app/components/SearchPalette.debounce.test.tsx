import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));
vi.mock('../../shared/platform/nodeSourceRuntimeRepository', () => ({
  loadRuntimeNodeSourceDetails: vi.fn()
}));
vi.mock('../../shared/platform/externalSearchRuntimeRepository', () => ({
  loadRuntimeExternalSearchFolders: vi.fn()
}));

vi.mock('../../shared/platform/removedSourcesRuntimeRepository', () => ({
  loadRuntimeRemovedSources: vi.fn()
}));

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { loadRuntimeExternalSearchFolders } from '../../shared/platform/externalSearchRuntimeRepository';
import { loadRuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceRuntimeRepository';
import { loadRuntimeRemovedSources } from '../../shared/platform/removedSourcesRuntimeRepository';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';

import { SearchPalette } from './SearchPalette';
import { searchSnapshot } from './searchPaletteTestSupport';

function renderSearchPalette() {
  return renderWithLocalization(
    <SearchPalette
      isOpen
      nodeOrder={[]}
      nodesById={{}}
      onClose={() => undefined}
      onOpenResult={() => undefined}
      trashedNodeIds={[]}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed, 'true');
  vi.clearAllMocks();
  vi.mocked(loadRuntimeRemovedSources).mockResolvedValue({ entries: [], loadedAt: '' });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('waits until input settles before running workspace search', async () => {
  const search = vi.fn().mockResolvedValue(searchSnapshot([]));
  vi.mocked(getRuntimeInvoke).mockReturnValue(search);
  vi.mocked(loadRuntimeNodeSourceDetails).mockResolvedValue(null);
  vi.mocked(loadRuntimeExternalSearchFolders).mockResolvedValue([]);
  renderSearchPalette();

  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), {
    target: { value: 'launch' }
  });
  act(() => vi.advanceTimersByTime(399));

  expect(search).not.toHaveBeenCalledWith('search_workspace', expect.anything());

  await act(async () => vi.advanceTimersByTime(1));

  expect(search).toHaveBeenCalledWith('search_workspace', { query: 'launch' });
});

it('does not run workspace search while IME composition is active', async () => {
  const search = vi.fn().mockResolvedValue(searchSnapshot([]));
  vi.mocked(getRuntimeInvoke).mockReturnValue(search);
  vi.mocked(loadRuntimeNodeSourceDetails).mockResolvedValue(null);
  vi.mocked(loadRuntimeExternalSearchFolders).mockResolvedValue([]);
  renderSearchPalette();

  const input = screen.getByRole('textbox', { name: 'Search workspace' });
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: 'laun' } });
  act(() => vi.advanceTimersByTime(800));

  expect(search).not.toHaveBeenCalledWith('search_workspace', expect.anything());

  fireEvent.compositionEnd(input);
  fireEvent.change(input, { target: { value: 'launch' } });
  await act(async () => vi.advanceTimersByTime(400));

  expect(search).toHaveBeenCalledWith('search_workspace', { query: 'launch' });
});

it('shows search progress through debounce and runtime completion before reporting no matches', async () => {
  let resolveSearch!: (value: ReturnType<typeof searchSnapshot>) => void;
  const pending = new Promise<ReturnType<typeof searchSnapshot>>((resolve) => { resolveSearch = resolve; });
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockImplementation((command) =>
    command === 'search_workspace' ? pending : Promise.resolve(undefined)));
  vi.mocked(loadRuntimeNodeSourceDetails).mockResolvedValue(null);
  vi.mocked(loadRuntimeExternalSearchFolders).mockResolvedValue([]);
  renderSearchPalette();
  const input = screen.getByRole('textbox', { name: 'Search workspace' });
  expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'launch' } });
  expect(screen.getByRole('status')).toHaveTextContent('Searching…');
  expect(screen.queryByText('No matching results')).not.toBeInTheDocument();
  await act(async () => vi.advanceTimersByTime(400));
  expect(screen.getByRole('status')).toHaveTextContent('Searching…');
  expect(screen.queryByText('No matching results')).not.toBeInTheDocument();
  await act(async () => resolveSearch(searchSnapshot([])));
  expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
  expect(screen.getByText('No matching results')).toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'next' } });
  expect(screen.getByRole('status')).toHaveTextContent('Searching…');
  expect(screen.queryByText('No matching results')).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: '' } });
  expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
  expect(screen.queryByText('No matching results')).not.toBeInTheDocument();
});

it('does not refresh removed import sources while searching', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue(searchSnapshot([])));
  renderSearchPalette();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), { target: { value: 'missing' } });
  await act(async () => vi.advanceTimersByTime(400));
  expect(screen.getByText('No matching results')).toBeInTheDocument();
  expect(loadRuntimeRemovedSources).not.toHaveBeenCalled();
});
