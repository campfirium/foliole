import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appDataRuntime = vi.hoisted(() => ({
  supportsClear: vi.fn(() => true)
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
    fireEvent.click(screen.getByRole('button', { name: /Customize Topic reading/ }));
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
});
