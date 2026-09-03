import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncGroupList } from './CompanionSyncDeviceList';

it('presents discovered entries as Sync Groups', () => {
  const candidate = {
    appVersion: '0.7.12',
    compatibility: { status: 'compatible' } as never,
    groupDisplayName: 'Studio',
    groupId: 'group-1',
    groupTag: 'tag-1',
    providerDeviceId: 'device-mac',
    providerDeviceName: 'Maci',
    providerPlatform: 'macOS'
  };
  renderWithLocalization(<CompanionSyncGroupList
    groups={[
      { ...candidate, endpointUrl: 'http://maci.local:38642' },
      { ...candidate, endpointUrl: 'http://android.local:38641', groupDisplayName: 'Field',
        groupId: 'group-2', groupTag: 'tag-2', providerDeviceId: 'device-a5',
        providerPlatform: 'android-capacitor' }
    ]}
    disabled={false}
    onJoin={vi.fn()}
  />);

  expect(screen.getByRole('heading', { name: 'Found 2 Sync Groups' })).toBeVisible();
  expect(screen.getAllByRole('button', { name: 'Join' })).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Join' })[0]).toHaveAttribute(
    'data-sync-group-id', 'group-1'
  );
  expect(screen.getAllByRole('button', { name: 'Join' })[0]).not.toHaveAttribute(
    'data-sync-endpoint'
  );
  expect(screen.queryByText('macOS')).not.toBeInTheDocument();
  expect(screen.queryByText('maci.local:38642')).not.toBeInTheDocument();
});
