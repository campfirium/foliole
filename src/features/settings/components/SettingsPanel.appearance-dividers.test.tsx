import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('edits workspace divider opacity from appearance settings', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="appearance" />);

  const opacity = screen.getByLabelText('Workspace divider opacity');

  expect(opacity).toHaveValue('100');

  fireEvent.change(opacity, { target: { value: '24' } });

  expect(opacity).toHaveValue('24');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceDividerOpacityPercent)).toBe('24');
  expect(document.documentElement.style.getPropertyValue('--workspace-divider-opacity')).toBe('0.24');
});
