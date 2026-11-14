import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import packageJson from '../../../../package.json';
import * as desktopRuntime from '../../../shared/platform/runtime';
import * as operatingSystem from '../../../shared/platform/runtime/operatingSystem';

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

it('keeps the WebDAV category hidden in a production browser renderer', () => {
  vi.stubEnv('MODE', 'production');
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="companion-sync" />);

  const sidebar = screen.getByLabelText('Settings categories');
  expect(within(sidebar).getByRole('button', { name: 'Sync' })).toBeVisible();
  expect(within(sidebar).queryByRole('button', { name: 'Sync (WebDAV)' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Sync' })).toBeVisible();
  expect(screen.queryByText('In development · Not yet available')).not.toBeInTheDocument();
  expect(screen.getByText('Manage this device and its Sync Group.')).toBeVisible();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('opens WebDAV as a peer of LAN sync in the public macOS build', async () => {
  vi.stubEnv('MODE', 'production');
  vi.spyOn(desktopRuntime, 'isDesktopRuntime').mockReturnValue(true);
  vi.spyOn(operatingSystem, 'resolveRuntimeOperatingSystem').mockReturnValue('macos');
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="companion-sync" />);
  const sidebar = within(screen.getByLabelText('Settings categories'));

  expect(sidebar.getByRole('button', { name: 'Sync (LAN)' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(sidebar.getByRole('button', { name: 'Sync (WebDAV)' }));
  expect(await screen.findByRole('heading', { name: 'Sync (WebDAV)' })).toBeVisible();
  expect(screen.queryByText('Experiment')).not.toBeInTheDocument();
  expect(sidebar.getByRole('button', { name: 'Sync (WebDAV)' })).toHaveAttribute('aria-current', 'page');
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

it('shows one current log message across recording and restarting', async () => {
  vi.spyOn(desktopRuntime, 'isDesktopRuntime').mockReturnValue(true);
  renderWithMouseGestureProvider(
    <SettingsPanel {...createProps()} requestedCategory="logs" />
  );

  const intro = 'Start recording when you encounter an issue to help troubleshoot it.';
  const exportButton = await screen.findByRole('button', { name: 'Export log' });
  expect(screen.getAllByText(intro)).toHaveLength(1);
  expect(exportButton).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
  expect(screen.queryByText(intro)).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Recording');
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));

  expect(screen.getByText('Recording ended.')).toBeVisible();
  expect(exportButton).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Record again' }));
  try {
    expect(screen.queryByText('Recording ended.')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Recording');
    expect(exportButton).toBeDisabled();
  } finally {
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
  }
});
