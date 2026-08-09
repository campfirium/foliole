import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { SettingsSyncGroupRows } from './SettingsSyncGroupRows';

const GROUP = {
  created_at: '2026-08-08T00:00:00.000Z', created_by_device_id: 'device-a', display_name: 'Studio',
  group_id: 'group-1', local_device_id: 'device-a', local_member_state: 'active' as const,
  members: [{
    approved_by_device_id: 'device-a', authorization_id: 'founder-a', device_id: 'device-a',
    device_kind: 'darwin', device_name: 'Studio Mac', joined_at: '2026-08-08T00:00:00.000Z',
    state: 'active' as const
  }],
  timeline_id: 'timeline-1'
};

it('offers direct authorization to a discovered Device in the same Sync Group', () => {
  const onRequestJoin = vi.fn();
  renderWithLocalization(<SettingsSyncGroupRows
    candidates={[{
      endpoint_url: 'http://device-c', group_display_name: 'Studio', group_id: 'group-1',
      provider_device_id: 'device-c', provider_device_kind: 'win32', provider_device_name: 'Travel PC',
      timeline_id: 'timeline-1'
    }]}
    group={GROUP} isBusy={false} isCreating={false} joinRequest={null} onApprove={vi.fn()}
    onCreate={vi.fn()} onDiscover={vi.fn()} onReject={vi.fn()} onRequestJoin={onRequestJoin}
    pendingRequests={[]}
  />);

  fireEvent.click(screen.getByRole('button', { name: 'Sync with Travel PC' }));
  expect(onRequestJoin).toHaveBeenCalledWith('http://device-c');
});

it('does not offer direct authorization to a different Sync Group', () => {
  renderWithLocalization(<SettingsSyncGroupRows
    candidates={[{
      endpoint_url: 'http://other', group_display_name: 'Other', group_id: 'group-2',
      provider_device_id: 'device-x', provider_device_kind: 'win32', provider_device_name: 'Other PC',
      timeline_id: 'timeline-2'
    }]}
    group={GROUP} isBusy={false} isCreating={false} joinRequest={null} onApprove={vi.fn()}
    onCreate={vi.fn()} onDiscover={vi.fn()} onReject={vi.fn()} onRequestJoin={vi.fn()}
    pendingRequests={[]}
  />);

  expect(screen.queryByRole('button', { name: 'Sync with Other PC' })).not.toBeInTheDocument();
});
