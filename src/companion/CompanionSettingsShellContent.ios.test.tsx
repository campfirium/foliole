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

it('keeps incomplete app-data clearing out of the iOS settings surface', () => {
  expect(supportsCompanionAppDataClear()).toBe(false);

  render(renderCompanionSettingsContent({
    onBackToSettingsList: vi.fn(),
    onOpenSyncSettings: vi.fn(),
    onOpenSyncSettingsPage: vi.fn(),
    settingsPage: 'list',
    workspaceSync: { state: { sync_onboarding_status: 'pending' } } as never
  }));

  expect(screen.getByText('4 sections')).toBeInTheDocument();
  expect(screen.queryByText('Storage')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Clear local app data/ })).not.toBeInTheDocument();
});
