import { screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import { renderWithLocalization } from '../localization/testLocalization';

import { SyncGroupRemovingDevices } from './SyncGroupRemovingDevices';

it('shows every confirming device name and removes the whole section when complete', () => {
  const entries = [{ target: { device_identity_key: 'target', device_name: 'Old phone' },
    confirmed_devices: ['Mac (a)', 'Mac (b)', 'Windows'].map(device_name => ({ device_name, device_identity_key: device_name })) }];
  const view = renderWithLocalization(<SyncGroupRemovingDevices entries={entries} />);
  const row = screen.getByRole('row', { name: /Old phone/ });
  expect(within(row).getByRole('cell')).toHaveTextContent('Mac (a), Mac (b), Windows');
  view.rerender(<SyncGroupRemovingDevices entries={[]} />);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
