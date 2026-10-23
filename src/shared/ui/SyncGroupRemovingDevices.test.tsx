import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { renderWithLocalization } from '../localization/testLocalization';

import { SyncGroupRemovingDevices } from './SyncGroupRemovingDevices';

it('shows confirmation progress as a list row and lists confirming devices on hover', () => {
  const entries = [{ target: { device_identity_key: 'target', device_name: 'Old phone' },
    confirmed_devices: ['Mac (a)', 'Windows'].map(device_name => ({ device_name, device_identity_key: device_name })) }];
  const view = renderWithLocalization(
    <div role="list"><SyncGroupRemovingDevices entries={entries} requiredCount={3} /></div>
  );
  const row = screen.getByRole('listitem');
  expect(row).toHaveTextContent('Old phone');
  expect(row).toHaveTextContent('2/3');
  expect(row).toHaveAttribute('title', expect.stringContaining('Mac (a), Windows'));
  view.rerender(<div role="list"><SyncGroupRemovingDevices entries={[]} requiredCount={3} /></div>);
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
});
