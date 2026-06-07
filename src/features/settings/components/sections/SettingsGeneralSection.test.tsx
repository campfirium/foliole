import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { APP_LANGUAGE_STORAGE_KEY } from '../../../../shared/localization/appLanguage';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { SettingsGeneralSection } from './SettingsGeneralSection';

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'en');
  window.electronAPI = {
    invoke: vi.fn(async (command: string) => {
      if (command === 'load_search_index_rebuild_status') return null;
      if (command === 'save_app_settings_state') return null;
      return null;
    }) as unknown as NativeInvoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onSearchIndexRebuildStatus: () => () => undefined,
    onWindowResized: () => () => undefined
  };
});

it('shows global clip behavior settings in General', async () => {
  renderWithLocalization(<SettingsGeneralSection />);

  const toggle = await screen.findByRole('switch', { name: 'Use current clipboard when nothing is selected' });
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(screen.queryByText('Alt+Shift+C')).not.toBeInTheDocument();

  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.globalClipExistingClipboardFallbackEnabled)).toBe('false');
});
