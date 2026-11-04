import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('CompanionSettingsShellContent', () => {
  beforeEach(() => {
    appDataRuntime.supportsClear.mockReturnValue(true);
    appDataRuntime.kind = 'web-preview';
  });

  it('keeps the settings entry focused on Sync and omits unavailable Device details', () => {
    render(<SettingsHarness />);

    expect(screen.getByText('Sync and device')).toBeInTheDocument();
    expect(screen.getByText('Data and appearance')).toBeInTheDocument();
    expect(screen.getByText('Development')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Sync content and view sync status/ })).toBeInTheDocument();
    expect(screen.queryByText('Device')).not.toBeInTheDocument();
  });

  it.each(['web-preview', 'ios-capacitor'] as const)('opens the %s custom CSS management surface', (runtimeKind) => {
    render(<SettingsHarness runtimeKind={runtimeKind} />);

    expect(screen.getByTestId('companion-settings-appearance')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Choose colors and customize Topic reading/ }));
    expect(screen.getByText('Custom CSS snippets')).toBeInTheDocument();
    expect(screen.getByTestId('companion-custom-css-settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add snippet' })).toBeInTheDocument();
  });

  it('opens the debug placeholder page', () => {
    render(<SettingsHarness />);

    fireEvent.click(screen.getByRole('button', { name: /Diagnostics/ }));
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
  });

  it('keeps app-data clearing unavailable on a runtime without its native capability', () => {
    appDataRuntime.supportsClear.mockReturnValue(false);

    render(<SettingsHarness />);

    expect(screen.queryByText('3 sections')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear local app data/ })).not.toBeInTheDocument();
  });

  it('opens Storage in the browser preview while keeping device operations disabled', async () => {
    appDataRuntime.kind = 'browser-preview';
    appDataRuntime.supportsClear.mockReturnValue(false);
    render(<SettingsHarness />);
    fireEvent.click(screen.getByTestId('companion-settings-storage'));
    expect(await screen.findByRole('heading', { name: 'Database backup' })).toBeInTheDocument();
    expect(screen.getByText('Backup and storage actions are available in the mobile app.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Automatic backup' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Local attachments' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear App Data' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
