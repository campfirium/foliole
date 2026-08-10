import { fireEvent, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncGroupRows } from './CompanionSyncGroupRows';

it('shows the persistent Sync Group name and active device membership', () => {
  renderWithLocalization(<CompanionSyncGroupRows group={{
    created_at: '2026-08-08T00:00:00.000Z', created_by_device_id: 'desktop-1', display_name: 'Studio',
    group_id: 'group-1', local_device_id: 'android-1', local_member_state: 'active',
    members: [{
      approved_by_device_id: 'desktop-1',
      authorization_id: 'request-1', device_id: 'android-1', device_kind: 'android-capacitor',
      device_name: 'Pixel', joined_at: '2026-08-08T00:00:00.000Z', state: 'active'
    }],
    timeline_id: 'timeline-1'
  }} />);

  expect(screen.getByText('Studio')).toBeInTheDocument();
  expect(screen.getByText('Pixel')).toBeInTheDocument();
  expect(screen.getByText('Active')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Leave Sync Group' }));
  expect(screen.getByText(/Topics and attachments stay on this device/)).toBeInTheDocument();
  expect(screen.getByTestId('companion-sync-group-leave-confirm')).toBeInTheDocument();
});
