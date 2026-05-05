import { screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = undefined;
});

it('uses the unified settings shell surfaces for sidebar and content area', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="appearance" />);

  const sidebar = screen.getByLabelText('Settings categories');
  const sidebarSurface = sidebar.firstElementChild;
  const dialog = screen.getByLabelText('Settings dialog');

  expect(sidebarSurface).not.toBeNull();
  expect(sidebarSurface?.className).toContain('bg-settings-sidebar');
  expect(sidebarSurface?.className).not.toContain('border-r');
  expect(dialog.className).toContain('bg-settings-shell');
  expect(dialog.className).toContain('border-settings-outline');
  expect(dialog.className).toContain('shadow-settings');
  expect(dialog.className).toContain('rounded-lg');
  expect(screen.getByText('Control the look and density of the workspace.').className).toContain('sr-only');
  expect(screen.getByRole('heading', { level: 3, name: 'Settings' })).toBeInTheDocument();
});
