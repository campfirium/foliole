import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = undefined;
});

it('persists workspace surface palette and region assignments from appearance settings', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add palette color' }));
  fireEvent.doubleClick(screen.getByRole('button', { name: 'Palette color 6' }), { clientX: 320, clientY: 240 });
  fireEvent.change(screen.getByLabelText('Workspace surface palette hex'), { target: { value: '#c9d4e7' } });
  fireEvent.click(screen.getByRole('button', { name: 'Palette color 6' }));
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Main doc' }));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    const assignments = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignments) ?? '{}');
    expect(palette[5]).toBe('#c9d4e7');
    expect(assignments['main-document']).toBe(5);
  });
});

it('hides settings while preview mode is active and restores it on escape', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Settings dialog').className).toContain('opacity-0');
  });

  fireEvent.keyDown(window, { key: 'Escape' });

  await waitFor(() => {
    expect(screen.getByLabelText('Settings dialog').className).not.toContain('opacity-0');
  });
});
