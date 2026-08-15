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

  const props = {
    onBackToSettingsList: vi.fn(),
    onOpenSyncSettings: vi.fn(),
    onOpenSyncSettingsPage: vi.fn(),
    settingsPage: 'list',
    workspaceSync: { state: { sync_onboarding_status: 'pending' } } as never
  } as const;
  const view = render(renderCompanionSettingsContent(props));

  expect(screen.getByText('3 sections')).toBeInTheDocument();
  expect(screen.queryByText('Storage')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Clear local app data/ })).not.toBeInTheDocument();
  view.rerender(renderCompanionSettingsContent({ ...props, settingsPage: 'appearance' }));
  expect(screen.getByText('Custom styles are not available on this device')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add snippet' })).not.toBeInTheDocument();
});
