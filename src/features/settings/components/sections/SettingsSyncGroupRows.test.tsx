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
  }, {
    approved_by_device_id: 'device-a', authorization_id: 'member-b', device_id: 'device-b',
    device_kind: 'android-capacitor', device_name: 'A5', joined_at: '2026-08-08T01:00:00.000Z',
    state: 'active' as const
  }],
  timeline_id: 'timeline-1'
};

function renderRows(overrides: Partial<Parameters<typeof SettingsSyncGroupRows>[0]> = {}) {
  const props = {
    candidates: [], group: GROUP, isBusy: false, isCreating: false, joinRequest: null,
    onApprove: vi.fn(), onCreate: vi.fn(), onDiscover: vi.fn(), onLeave: vi.fn(), onReject: vi.fn(),
    onRemove: vi.fn(), onRequestJoin: vi.fn(), onToggleSync: vi.fn(), pendingRequests: [], syncEnabled: true,
    ...overrides
  };
  renderWithLocalization(<SettingsSyncGroupRows {...props} />);
  return props;
}

it('offers only the actions that are valid for local and remote members', () => {
  const props = renderRows();

  fireEvent.click(screen.getByRole('button', { name: 'Pause Sync' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove from Sync Group' }));
  fireEvent.click(screen.getByRole('button', { name: 'Leave Sync Group' }));

  expect(props.onToggleSync).toHaveBeenCalledTimes(1);
  expect(props.onRemove).toHaveBeenCalledWith('device-b');
  expect(props.onLeave).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Studio Mac's Sync Group")).toBeVisible();
  expect(screen.queryByText("Studio's Sync Group")).not.toBeInTheDocument();
  expect(screen.getByText('macOS')).toBeVisible();
  expect(screen.getByText('Android')).toBeVisible();
});

it('shows resume for the local member while sync is paused', () => {
  const props = renderRows({ syncEnabled: false });
  fireEvent.click(screen.getByRole('button', { name: 'Resume Sync' }));
  expect(props.onToggleSync).toHaveBeenCalledTimes(1);
});

it('keeps same-base members visible and targets the suffixed member independently', () => {
  const props = renderRows({
    group: {
      ...GROUP,
      local_device_id: 'Maci',
      members: GROUP.members.map((member, index) => ({
        ...member,
        device_id: index === 0 ? 'Maci' : 'Maci 2',
        device_name: index === 0 ? 'Maci' : 'Maci 2'
      }))
    }
  });
  expect(screen.getByText('Maci')).toBeVisible();
  expect(screen.getByText('Maci 2')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Remove from Sync Group' }));
  expect(props.onRemove).toHaveBeenCalledWith('Maci 2');
});
