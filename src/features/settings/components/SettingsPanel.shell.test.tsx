import { screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import packageJson from '../../../../package.json';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

const CURRENT_VERSION_LABEL = `v${packageJson.version}`;

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
  expect(within(sidebar).getByText(CURRENT_VERSION_LABEL)).toBeVisible();
  expect(sidebar.querySelector('img[src*="foliole-leaf-tight"]')).not.toBeNull();
  expect(within(sidebar).queryByRole('textbox', { name: 'Search settings' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Search settings' })).toBeVisible();
  expect(screen.getByRole('heading', { level: 2, name: 'Appearance' })).toBeVisible();
  expect(screen.getByText('Adjust the look and density of the workspace.')).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Appearance' }).className).toContain('bg-settings-selected');
  expect(screen.getByRole('button', { name: 'Appearance' }).className.split(' ')).not.toContain('bg-foreground');
  expect(screen.getByRole('button', { name: 'Backups' }).className).toContain('hover:bg-settings-selected');
});

it('keeps settings dividers aligned without title extension lines', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="review" />);

  const pageTitleShell = screen.getByRole('heading', { level: 2, name: 'Review' }).parentElement;
  const sectionHeader = screen.getByRole('heading', { level: 3, name: 'Scheduler' }).parentElement?.parentElement;
  const storageGroup = screen.getByText('Storage').closest('.relative');
  const desiredRetentionRow = screen.getByRole('heading', { level: 4, name: 'Desired retention' }).parentElement?.parentElement;

  expect(pageTitleShell?.className).not.toContain('border-b');
  expect(sectionHeader?.className).not.toContain('border-b');
  expect(storageGroup?.className).toContain('before:left-3');
  expect(storageGroup?.className).toContain('before:right-3');
  expect(storageGroup?.className).toContain('before:border-t');
  expect(storageGroup?.className).toContain('before:border-settings-divider/65');
  expect(storageGroup?.className.split(' ')).not.toContain('border-t');
  expect(desiredRetentionRow?.className).toContain('before:left-settings-panel-x');
  expect(desiredRetentionRow?.className).toContain('before:right-settings-panel-x');
});

it('marks Sync as not yet available only after opening its settings page', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="companion-sync" />);

  const sidebar = screen.getByLabelText('Settings categories');
  expect(within(sidebar).getByRole('button', { name: 'Sync' })).toBeVisible();
  expect(within(sidebar).queryByText('In development · Not yet available')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Sync' })).toBeVisible();
  expect(screen.getByText('In development · Not yet available')).toBeVisible();
});

it('places the mouse gesture switch in the category header', () => {
  renderWithMouseGestureProvider(
    <SettingsPanel {...createProps()} requestedCategory="mouse-gestures" />
  );

  const title = screen.getByRole('heading', { level: 2, name: 'Mouse gestures' });
  const toggle = screen.getByRole('switch', { name: 'Mouse gestures' });
  expect(title.parentElement).toContainElement(toggle);
  expect(screen.getByRole('button', { name: 'Gesture appearance' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  expect(screen.getByRole('heading', { level: 3, name: 'Gesture actions' })).toBeVisible();
});
