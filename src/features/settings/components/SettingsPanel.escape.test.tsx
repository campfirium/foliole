import { fireEvent } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('closes settings from the shared Escape stack', () => {
  const onClose = vi.fn();
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} onClose={onClose} />);

  fireEvent.keyDown(window, { key: 'Escape' });

  expect(onClose).toHaveBeenCalledTimes(1);
});

it('lets nested settings dialogs handle Escape before the settings panel', () => {
  const onClose = vi.fn();
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} onClose={onClose} />);
  const nestedDialog = document.createElement('div');
  nestedDialog.setAttribute('data-settings-nested-dialog', 'true');
  document.body.append(nestedDialog);

  fireEvent.keyDown(window, { key: 'Escape' });

  expect(onClose).not.toHaveBeenCalled();
  nestedDialog.remove();
});
