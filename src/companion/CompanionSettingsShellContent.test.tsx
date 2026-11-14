import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const nativeApp = vi.hoisted(() => ({ getInfo: vi.fn() }));
vi.mock('@capacitor/app', async importOriginal => ({
  ...await importOriginal<typeof import('@capacitor/app')>(),
  App: { getInfo: nativeApp.getInfo }
}));

const appDataRuntime = vi.hoisted(() => ({
  supportsClear: vi.fn(() => true),
  kind: 'web-preview'
}));

vi.mock('../shared/platform/companionRuntimeCapabilities', async importOriginal => ({
  ...await importOriginal<typeof import('../shared/platform/companionRuntimeCapabilities')>(),
  getCompanionRuntimeCapability: () => ({ kind: appDataRuntime.kind, platform: 'web' })
}));

vi.mock('../shared/platform/companionAppDataRuntimeRepository', () => ({
  FolioleCompanionAppData: { clearAppData: vi.fn() },
  isNativeAndroidCompanionRuntime: vi.fn(() => false),
  supportsCompanionAppDataClear: appDataRuntime.supportsClear
}));

import { createCompanionSettingsPreview } from '../../scripts/vite/companionSettingsPreview';

import { CompanionCustomCssProvider } from './CompanionCustomCssProvider';
import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

function SettingsHarness({ runtimeKind = 'web-preview' }: { runtimeKind?: 'web-preview' | 'ios-capacitor' }) {
  const [settingsPage, setSettingsPage] = useState<CompanionSettingsPage>('list');
  return (
    <CompanionCustomCssProvider runtimeKind={runtimeKind}>
      {renderCompanionSettingsContent({
        onBackToSettingsList: () => setSettingsPage('list'),
        onOpenSyncSettings: () => setSettingsPage('sync'),
        onOpenSyncSettingsPage: setSettingsPage,
        settingsPage,
        workspaceSync: { state: { sync_onboarding_status: 'pending' } } as never
      })}
    </CompanionCustomCssProvider>
  );
}

beforeEach(() => {
  appDataRuntime.supportsClear.mockReturnValue(true);
  appDataRuntime.kind = 'web-preview';
  nativeApp.getInfo.mockReset().mockResolvedValue({ id: 'com.foliole.app', version: '9.4.2', build: '302' });
});
afterEach(() => { delete window.__folioleSettingsPreview; });

describe('CompanionSettingsShellContent', () => {
  it('puts Appearance first and omits unavailable Device details', () => {
    render(<SettingsHarness />);

    expect(screen.getAllByRole('button')[0]).toHaveAccessibleName('Appearance Language and display');
    expect(screen.getByText('Sync and device')).toBeInTheDocument();
    expect(screen.getByText('Data')).toBeInTheDocument();
    expect(screen.queryByText('Development')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument();
    expect(screen.queryByText('Device')).not.toBeInTheDocument();
  });

  it.each(['web-preview', 'ios-capacitor'] as const)('opens the %s custom CSS management surface', (runtimeKind) => {
    render(<SettingsHarness runtimeKind={runtimeKind} />);

    expect(screen.getByTestId('companion-settings-appearance')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Appearance Language and display' }));
    expect(screen.getByText('Custom CSS snippets')).toBeInTheDocument();
    expect(screen.getByTestId('companion-custom-css-settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add snippet' })).toBeInTheDocument();
  });

  it('keeps app-data clearing unavailable on a runtime without its native capability', () => {
    appDataRuntime.supportsClear.mockReturnValue(false);

    render(<SettingsHarness />);

    expect(screen.queryByText('3 sections')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear local app data/ })).not.toBeInTheDocument();
  });

  it('opens Backup and Attachments directly from Settings and leaves clearing on the home page', async () => {
    appDataRuntime.kind = 'browser-preview';
    appDataRuntime.supportsClear.mockReturnValue(false);
    window.__folioleSettingsPreview = createCompanionSettingsPreview();
    render(<SettingsHarness />);
    expect(screen.getByRole('button', { name: 'Clear App Data' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear App Data' }));
    const clearDialog = await screen.findByRole('dialog');
    expect(within(clearDialog).getByRole('button', { name: 'Clear App Data' })).toBeDisabled();
    fireEvent.click(within(clearDialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('companion-settings-storage')).not.toBeInTheDocument();
    expect(screen.getByTestId('companion-settings-backup')).toHaveTextContent('Pending automatic backup: 3');
    fireEvent.click(screen.getByTestId('companion-settings-backup'));
    expect(screen.getByRole('status')).toHaveTextContent('Pending automatic backup: 3');
    expect(screen.queryByText(/Backup status is an example/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Backup location Documents / Foliole Backups' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'Automatic backup' })).toBeEnabled();
    expect(screen.queryByRole('switch', { name: 'Automatic cleanup' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear App Data' })).not.toBeInTheDocument();
  });
});

it('shows attachment size and trash summaries in preview without technical notices in the product page', async () => {
  appDataRuntime.kind = 'browser-preview'; appDataRuntime.supportsClear.mockReturnValue(false);
  window.__folioleSettingsPreview = createCompanionSettingsPreview();
  const view = render(<SettingsHarness />);
  expect(await screen.findByText('Used 16.2 MB · Ready to clean 0 B')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('companion-settings-attachments'));
  expect(await screen.findByRole('button', { name: 'Days unused before cleanup 30 days' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Mark ready to clean' })).toBeEnabled();
  expect(screen.queryByText(/available in the mobile app/)).not.toBeInTheDocument();
  view.unmount(); delete window.__folioleSettingsPreview;
});

describe('Companion About and test tools', () => {
  it.each(['ios-native', 'android-native'])('shows the installed %s version as plain text in About', async kind => {
    appDataRuntime.kind = kind;
    render(<SettingsHarness />);
    expect(screen.getByRole('button', { name: 'Send Feedback' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Test tools' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'About' }));

    expect(await screen.findByText('9.4.2 (302)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /version/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Changelog' })).toHaveAttribute('href', 'https://foliole.app/changelog/');
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', 'https://foliole.app/privacy/');
    expect(screen.getByRole('link', { name: 'Discuss' })).toHaveAttribute('href', 'https://github.com/campfirium/foliole/discussions');
  });

  it('does not show a package version as installed in the browser', async () => {
    render(<SettingsHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(await screen.findByText('Installed version unavailable')).toBeInTheDocument();
    expect(nativeApp.getInfo).not.toHaveBeenCalled();
  });

  it('offers Test tools only in the Android acceptance app', async () => {
    appDataRuntime.kind = 'android-native';
    nativeApp.getInfo.mockResolvedValue({ id: 'com.campfirium.foliole.android.acceptance' });
    render(<SettingsHarness />);
    expect(await screen.findByRole('button', { name: 'Test tools' })).toBeInTheDocument();
  });

});

it.each(['android-native', 'ios-native'])('opens Logs from settings on %s', kind => {
  appDataRuntime.kind = kind;
  render(<SettingsHarness />);
  fireEvent.click(screen.getByRole('button', { name: /^Logs/ }));
  expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Export log' })).toBeDisabled();
});

it('places the Android correction and capture controls on Diagnostics', () => {
  appDataRuntime.kind = 'android-native';
  const { unmount } = render(<SettingsHarness />);
  fireEvent.click(screen.getByRole('button', { name: /^Logs/ }));
  expect(screen.queryByRole('combobox', { name: 'Devanagari annotation boundaries' })).toBeNull();
  unmount();

  render(<SettingsHarness />);
  fireEvent.click(screen.getByRole('button', { name: /^Diagnostics/ }));
  expect(screen.getByRole('combobox', { name: 'Devanagari annotation boundaries' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Export log' })).toBeDisabled();
});
