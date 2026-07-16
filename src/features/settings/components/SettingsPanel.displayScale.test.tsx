import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('stores app display size from Appearance and resets the default override', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="appearance" />);
  const slider = screen.getByLabelText('App display size percentage');
  fireEvent.change(slider, { target: { value: '130' } });

  await waitFor(() => {
    expect(slider).toHaveValue('130');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent)).toBe('130');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Reset app display size' }));
  await waitFor(() => {
    expect(slider).toHaveValue('100');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent)).toBeNull();
  });
});
