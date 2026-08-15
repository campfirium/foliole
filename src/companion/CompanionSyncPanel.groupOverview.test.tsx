import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { SyncGroupMemberPayload } from '../../lib/platform/syncGroupContract';

import { CompanionSyncGroupOverview } from './CompanionSyncGroupOverview';
import { CompanionSyncPanel } from './CompanionSyncPanel';
import { createConnectedProps } from './CompanionSyncPanel.connected.testSupport';

function member(deviceId: string, kind: string, name: string, state: 'active' | 'left'): SyncGroupMemberPayload {
  return {
    approved_by_device_id: 'desktop-1', authorization_id: `${deviceId}-auth`, device_id: deviceId,
    device_kind: kind, device_name: name, joined_at: '2026-08-08T00:00:00.000Z', state
  };
}

function renderDevicePriority(members: SyncGroupMemberPayload[]) {
  return render(<CompanionSyncGroupOverview group={{
    created_at: '2026-08-08T00:00:00.000Z', created_by_device_id: 'desktop-1', display_name: 'Maci',
    group_id: 'group-1', local_device_id: 'local-1', local_member_state: 'active', members,
    timeline_id: 'timeline-1'
  }} isSyncing={false} onOpen={() => undefined} sourceDeviceId={null} />);
}

it('keeps transient pipeline details out of the Sync Group overview', () => {
  const props = createConnectedProps();
  render(
    <CompanionSyncPanel
      {...props}
      pairingState={{ ...props.pairingState, remote_peer_id: 'desktop-1' }}
      status="syncing"
      syncGroup={{
        created_at: '2026-08-08T00:00:00.000Z',
        created_by_device_id: 'desktop-1',
        display_name: 'Maci',
        group_id: 'group-1',
        local_device_id: 'ios-1',
        local_member_state: 'active',
        members: [
          {
            approved_by_device_id: 'desktop-1', authorization_id: 'desktop-auth', device_id: 'desktop-1',
            device_kind: 'darwin', device_name: 'Maci', joined_at: '2026-08-08T00:00:00.000Z', state: 'active'
          },
          {
            approved_by_device_id: 'desktop-1', authorization_id: 'ios-auth', device_id: 'ios-1',
            device_kind: 'ios-capacitor', device_name: 'Foliole Review', joined_at: '2026-08-08T00:01:00.000Z', state: 'active'
          },
          {
            approved_by_device_id: 'desktop-1', authorization_id: 'android-auth', device_id: 'android-1',
            device_kind: 'android-capacitor', device_name: 'A5', joined_at: '2026-08-08T00:02:00.000Z', state: 'active'
          }
        ],
        timeline_id: 'timeline-1'
      }}
      syncProgress={{ completed: 0, phase: 'structure', total: null }}
    />
  );

  expect(screen.getByText('Current Sync Group')).toBeInTheDocument();
  expect(screen.getByText("Maci's Sync Group")).toBeInTheDocument();
  expect(screen.getByTestId('companion-sync-group-device')).toHaveTextContent(/^MacimacOS/);
  expect(screen.queryByText('A5')).not.toBeInTheDocument();
  expect(screen.queryByText('Foliole Review')).not.toBeInTheDocument();
  expect(screen.getByTestId('companion-sync-source-indicator')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Syncing' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Pause Sync' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Details' }));
  expect(props.onOpenSettingsPage).toHaveBeenCalledWith('syncGroup');
  expect(screen.queryByText('Library index')).not.toBeInTheDocument();
  expect(screen.queryByText('Pulling changes now.')).not.toBeInTheDocument();
});

it('shows the only active remote device even when an offline desktop exists', () => {
  renderDevicePriority([
    member('desktop-1', 'darwin', 'Maci', 'left'),
    member('phone-1', 'ios-capacitor', 'iPhone', 'active'),
    member('local-1', 'android-capacitor', 'A5', 'active')
  ]);

  expect(screen.getByTestId('companion-sync-group-device')).toHaveTextContent(/^iPhoneiOS/);
});

it('falls back to the desktop device when no remote device is active', () => {
  renderDevicePriority([
    member('desktop-1', 'darwin', 'Maci', 'left'),
    member('phone-1', 'ios-capacitor', 'iPhone', 'left'),
    member('local-1', 'android-capacitor', 'A5', 'active')
  ]);

  expect(screen.getByTestId('companion-sync-group-device')).toHaveTextContent(/^MacimacOS/);
});
