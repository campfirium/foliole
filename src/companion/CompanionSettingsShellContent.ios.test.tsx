import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
    isNativePlatform: () => true
  },
  registerPlugin: vi.fn(() => ({}))
}));

import { supportsCompanionAppDataClear } from '../shared/platform/companionAppDataRuntimeRepository';

import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';

it('shows iOS attachment storage without exposing incomplete app-data clearing', () => {
  expect(supportsCompanionAppDataClear()).toBe(false);

  const props = {
    onBackToSettingsList: vi.fn(),
    onOpenSyncSettings: vi.fn(),
    onOpenSyncSettingsPage: vi.fn(),
    settingsPage: 'list',
    workspaceSync: { state: { sync_onboarding_status: 'pending' } } as never
  } as const;
  const view = render(renderCompanionSettingsContent(props));

  expect(screen.queryByText('3 sections')).not.toBeInTheDocument();
  expect(screen.getByText('Storage')).toBeInTheDocument();
  expect(screen.getByText('Local attachments')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Clear local app data/ })).not.toBeInTheDocument();
  view.rerender(renderCompanionSettingsContent({ ...props, settingsPage: 'storage' }));
  expect(screen.queryByText('App data')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Clear App Data' })).not.toBeInTheDocument();
  view.rerender(renderCompanionSettingsContent({ ...props, settingsPage: 'appearance' }));
  expect(screen.getByText('Custom styles are not available on this device')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add snippet' })).not.toBeInTheDocument();
});
