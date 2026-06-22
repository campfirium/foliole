import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY } from '../../../lib/core/database/fullTextSearchIndexStrategy';
import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import {
  installDemoRuntimeController,
  type DemoRuntimeController,
  type DemoRuntimeState
} from '../../shared/platform/runtime/demoRuntime';

import { SearchPaletteEnhancementPrompt } from './SearchPaletteEnhancementPrompt';

function installDemoState(isDemo: boolean) {
  const state: DemoRuntimeState = {
    clearError: null,
    importError: null,
    importedTopicCount: 0,
    isDemo,
    manualAdvanceDays: 0,
    previewDay: 0,
    startedAt: null
  };
  installDemoRuntimeController({
    clearLocalData: () => Promise.resolve(false),
    continueToNextPreviewDay: () => undefined,
    getNowIso: (realNow) => realNow.toISOString(),
    getState: () => state,
    importMarkdown: () => Promise.resolve({ ignoredCount: 0, importedTopicCount: 0 }),
    subscribe: () => () => undefined
  } satisfies DemoRuntimeController);
}

beforeEach(() => {
  window.localStorage.clear();
  installDemoState(false);
  const invoke = vi.fn(async (command: string) => {
    if (command === 'save_app_settings_state') return null;
    if (command === 'rebuild_search_index') {
      return { status: 'rebuilding', strategy: 'cjk-trigram' };
    }
    return null;
  }) as unknown as NativeInvoke;
  window.electronAPI = {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onSearchIndexRebuildStatus: () => () => undefined,
    onWindowResized: () => () => undefined
  };
  vi.clearAllMocks();
});

it('does not offer the CJK search language in the Demo runtime', () => {
  installDemoState(true);

  renderWithLocalization(<SearchPaletteEnhancementPrompt />);

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed)).toBeNull();
  expect(window.electronAPI?.invoke).not.toHaveBeenCalled();
});

it('offers the Chinese, Japanese, or Korean search language once and turns it on', async () => {
  const view = renderWithLocalization(<SearchPaletteEnhancementPrompt />);

  expect(screen.getByRole('dialog', {
    name: 'Use Chinese, Japanese, or Korean search?'
  })).toBeInTheDocument();
  expect(screen.getByText(/languages that are not separated by spaces/)).toBeInTheDocument();
  expect(screen.getByText(/uses more search data/i)).toBeInTheDocument();
  expect(screen.getByText(/Settings > General/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Use this option' }));

  await waitFor(() => {
    expect(window.localStorage.getItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY)).toBe('cjk-trigram');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed)).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Search language updated' })).toBeInTheDocument();
  });
  expect(screen.getByText('Preparing search data...')).toBeInTheDocument();

  view.unmount();
  renderWithLocalization(<SearchPaletteEnhancementPrompt />);

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('dismisses the search language prompt without changing the strategy', () => {
  renderWithLocalization(<SearchPaletteEnhancementPrompt />);

  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed)).toBe('true');
  expect(window.localStorage.getItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY)).toBeNull();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('does not prompt when the CJK search strategy is already selected and records the prompt as handled', async () => {
  window.localStorage.setItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY, 'cjk-trigram');

  renderWithLocalization(<SearchPaletteEnhancementPrompt />);

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed)).toBe('true');
  });
});

it('keeps the search language prompt visible when local settings cannot be written', async () => {
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  renderWithLocalization(<SearchPaletteEnhancementPrompt />);

  fireEvent.click(screen.getByRole('button', { name: 'Use this option' }));

  expect(await screen.findByText('Full-text search language could not be updated.')).toBeInTheDocument();
  expect(screen.getByRole('dialog', {
    name: 'Use Chinese, Japanese, or Korean search?'
  })).toBeInTheDocument();
  setItem.mockRestore();
});
