import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
    isNativePlatform: () => true,
    isPluginAvailable: () => false
  },
  registerPlugin: vi.fn(() => ({}))
}));

import { supportsCompanionAppDataClear } from '../shared/platform/companionAppDataRuntimeRepository';

import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';

it('shows iOS storage and app-data clearing while keeping unsupported custom styles hidden', () => {
  expect(supportsCompanionAppDataClear()).toBe(true);

  const props = {
    onBackToSettingsList: vi.fn(),
    onOpenSyncSettings: vi.fn(),
    onOpenSyncSettingsPage: vi.fn(),
    settingsPage: 'list',
    workspaceSync: { state: { sync_onboarding_status: 'pending' } } as never
  } as const;
  const view = render(renderCompanionSettingsContent(props));

  expect(screen.queryByText('3 sections')).not.toBeInTheDocument();
  expect(screen.queryByTestId('companion-settings-backup')).not.toBeInTheDocument();
  expect(screen.getByTestId('companion-settings-attachments')).toBeInTheDocument();
  expect(screen.queryByText('Storage')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Clear local app data/ })).not.toBeInTheDocument();
  view.rerender(renderCompanionSettingsContent({ ...props, settingsPage: 'list' }));
  expect(screen.getByText('App data')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Clear App Data' })).toBeInTheDocument();
  view.rerender(renderCompanionSettingsContent({ ...props, settingsPage: 'appearance' }));
  expect(screen.getByText('Custom styles are not available on this device')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add snippet' })).not.toBeInTheDocument();
});
