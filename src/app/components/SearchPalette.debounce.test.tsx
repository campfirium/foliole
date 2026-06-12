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

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { loadRuntimeExternalSearchFolders } from '../../shared/platform/externalSearchRuntimeRepository';
import { loadRuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceRuntimeRepository';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';

import { SearchPalette } from './SearchPalette';

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
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('waits until input settles before running workspace search', async () => {
  const search = vi.fn().mockResolvedValue([]);
  vi.mocked(getRuntimeInvoke).mockReturnValue(search);
  vi.mocked(loadRuntimeNodeSourceDetails).mockResolvedValue(null);
  vi.mocked(loadRuntimeExternalSearchFolders).mockResolvedValue([]);
  renderSearchPalette();

  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), {
    target: { value: 'launch' }
  });
  act(() => vi.advanceTimersByTime(399));

  expect(search).not.toHaveBeenCalled();

  await act(async () => vi.advanceTimersByTime(1));

  expect(search).toHaveBeenCalledWith('search_workspace', { query: 'launch' });
});

it('does not run workspace search while IME composition is active', async () => {
  const search = vi.fn().mockResolvedValue([]);
  vi.mocked(getRuntimeInvoke).mockReturnValue(search);
  vi.mocked(loadRuntimeNodeSourceDetails).mockResolvedValue(null);
  vi.mocked(loadRuntimeExternalSearchFolders).mockResolvedValue([]);
  renderSearchPalette();

  const input = screen.getByRole('textbox', { name: 'Search workspace' });
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: 'laun' } });
  act(() => vi.advanceTimersByTime(800));

  expect(search).not.toHaveBeenCalled();

  fireEvent.compositionEnd(input);
  fireEvent.change(input, { target: { value: 'launch' } });
  await act(async () => vi.advanceTimersByTime(400));

  expect(search).toHaveBeenCalledWith('search_workspace', { query: 'launch' });
});
