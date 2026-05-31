import { screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('uses the unified settings shell surfaces for sidebar and content area', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="appearance" />);

  const sidebar = screen.getByLabelText('Settings categories');
  const sidebarSurface = sidebar.firstElementChild;
  const dialog = screen.getByLabelText('Settings dialog');

  expect(sidebarSurface).not.toBeNull();
  expect(sidebar.className).toContain('border-r');
  expect(sidebar.className).toContain('border-settings-divider');
  expect(sidebarSurface?.className).toContain('bg-settings-sidebar');
  expect(dialog.className).toContain('bg-settings-group');
  expect(dialog.className).toContain('border-settings-outline');
  expect(dialog.className).toContain('shadow-settings');
  expect(dialog.className).toContain('rounded-lg');
  expect(within(sidebar).getByText('Foliole')).toBeVisible();
  expect(within(sidebar).getByText('v0.6.1')).toBeVisible();
  expect(sidebar.querySelector('img[src*="foliole-app-icon"]')).not.toBeNull();
  expect(within(sidebar).queryByRole('textbox', { name: 'Search settings' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Search settings' })).toBeVisible();
  expect(screen.getByRole('heading', { level: 2, name: 'Appearance' })).toBeVisible();
  expect(screen.getByText('Adjust the look and density of the workspace.')).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Appearance' }).className).toContain('bg-settings-selected');
  expect(screen.getByRole('button', { name: 'Appearance' }).className.split(' ')).not.toContain('bg-foreground');
  expect(screen.getByRole('button', { name: 'Backups' }).className).toContain('hover:bg-settings-selected');
});
