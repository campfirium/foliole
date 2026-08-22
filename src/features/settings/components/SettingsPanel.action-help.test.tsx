import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { CustomCopyDialogHost } from './CustomCopyDialogHost';
import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('toggles action help on hover from general settings', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="general" />);

  const toggle = screen.getByRole('switch', { name: 'Action help on hover' });
  expect(toggle).toHaveAttribute('aria-checked', 'true');

  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.actionHelpCardsEnabled)).toBe('false');
});

it('places custom copy before action help and opens the shared manager', () => {
  renderWithMouseGestureProvider(<><CustomCopyDialogHost /><SettingsPanel {...createProps()} requestedCategory="general" /></>);

  const manage = screen.getByRole('button', { name: 'Manage...' });
  const actionHelp = screen.getByRole('switch', { name: 'Action help on hover' });
  expect(manage.compareDocumentPosition(actionHelp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  fireEvent.click(manage);
  expect(screen.getByRole('dialog', { name: 'Custom copy' })).toBeInTheDocument();
});
