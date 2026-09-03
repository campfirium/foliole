import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncDeviceList } from './CompanionSyncDeviceList';

it('gives each discovered provider a distinct accessible Join action', () => {
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
  renderWithLocalization(<CompanionSyncDeviceList
    devices={[
      { ...candidate, endpointUrl: 'http://maci.local:38642' },
      { ...candidate, endpointUrl: 'http://android.local:38641', providerDeviceId: 'device-a5',
        providerPlatform: 'android-capacitor' }
    ]}
    disabled={false}
    onJoin={vi.fn()}
  />);

  expect(screen.getByRole('button', { name: 'Join: Studio (macOS)' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Join: Studio (android-capacitor)' })).toBeEnabled();
});
