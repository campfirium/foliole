import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncGroupList } from './CompanionSyncDeviceList';

it('presents discovered entries as Sync Groups', () => {
  const candidate = {
    appVersion: '0.7.12',
    compatibility: { status: 'compatible' } as never,
    groupDisplayName: 'Macky',
    groupId: 'group-1',
    groupTag: 'tag-1',
    providerDeviceId: 'device-mac',
    providerDeviceName: 'Maci',
    providerPlatform: 'macOS'
  };
  renderWithLocalization(<CompanionSyncGroupList
    groups={[
      { ...candidate, endpointUrl: 'http://maci.local:38642' },
      { ...candidate, endpointUrl: 'http://android.local:38641',
        groupId: 'group-2', groupTag: 'tag-2', providerDeviceId: 'device-a5',
        providerPlatform: 'android-capacitor' }
    ]}
    disabled={false}
    onJoin={vi.fn()}
  />);

  expect(screen.getByRole('heading', { name: 'Found 2 Sync Groups' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Join group-1' })).toHaveAttribute(
    'data-sync-group-id', 'group-1'
  );
  expect(screen.getByRole('button', { name: 'Join group-1' })).not.toHaveAttribute(
    'data-sync-endpoint'
  );
  expect(screen.getAllByText('Macky')).toHaveLength(2);
  expect(screen.getByText('38642')).toBeVisible();
  expect(screen.queryByText('38641')).not.toBeInTheDocument();
  expect(screen.queryByText('macOS')).not.toBeInTheDocument();
  expect(screen.queryByText('maci.local:38642')).not.toBeInTheDocument();
});
