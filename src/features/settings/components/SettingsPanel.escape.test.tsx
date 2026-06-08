import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useSettingsPanelEscape } from './useSettingsPanelChrome';

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

function pressEscape() {
  window.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }));
}

function renderSettingsEscape(onClose: () => void, searchQuery = '') {
  renderHook(() => useSettingsPanelEscape(false, { current: searchQuery }, onClose));
}

it('closes settings from the shared Escape stack', () => {
  const onClose = vi.fn();
  renderSettingsEscape(onClose);

  pressEscape();

  expect(onClose).toHaveBeenCalledTimes(1);
});

it('lets nested settings dialogs handle Escape before the settings panel', () => {
  const onClose = vi.fn();
  renderSettingsEscape(onClose);
  const nestedDialog = document.createElement('div');
  nestedDialog.setAttribute('data-settings-nested-dialog', 'true');
  document.body.append(nestedDialog);

  pressEscape();

  expect(onClose).not.toHaveBeenCalled();
  nestedDialog.remove();
});

it('lets foreground app dialogs handle Escape before the settings panel', () => {
  const onClose = vi.fn();
  renderSettingsEscape(onClose);
  const foregroundDialog = document.createElement('div');
  foregroundDialog.setAttribute('aria-label', 'Feedback');
  foregroundDialog.setAttribute('role', 'dialog');
  foregroundDialog.className = 'z-modal';
  document.body.append(foregroundDialog);

  pressEscape();

  expect(onClose).not.toHaveBeenCalled();
  foregroundDialog.remove();
});

it('lets settings search consume Escape before closing settings', () => {
  const onClose = vi.fn();
  renderSettingsEscape(onClose, 'feedback');

  pressEscape();

  expect(onClose).not.toHaveBeenCalled();
});
