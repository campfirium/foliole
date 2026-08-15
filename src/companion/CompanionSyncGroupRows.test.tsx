import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncGroupRows } from './CompanionSyncGroupRows';

const providerMocks = vi.hoisted(() => ({ load: vi.fn(), setPaused: vi.fn() }));

vi.mock('../shared/platform/companion/sync/syncGroupProvider', () => ({
  loadCompanionSyncGroupProviderState: providerMocks.load,
  setCompanionSyncPaused: providerMocks.setPaused
}));

beforeEach(() => {
  vi.clearAllMocks();
  const state = {
    lifecycle_active: true, participating: true,
    pending_requests: [{ device_name: 'Waiting phone', pair_request_id: 'request-2' }], port: 38641,
    state: 'running', sync_enabled: true, sync_paused: false
  };
  providerMocks.load.mockResolvedValue(state);
  providerMocks.setPaused.mockResolvedValue({ ...state, sync_paused: true });
});

it('shows persistent membership and keeps Leave independent from participation controls', async () => {
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

  expect(screen.getByText("Studio's Sync Group")).toBeInTheDocument();
  expect(screen.getByText('Pixel')).toBeInTheDocument();
  expect(screen.queryByText('Waiting phone')).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Pause Sync' }));
  expect(providerMocks.setPaused).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'Leave Sync Group' }));
  expect(screen.getByText(/Topics and attachments stay on this device/)).toBeInTheDocument();
  expect(screen.getByTestId('companion-sync-group-leave-confirm')).toBeInTheDocument();
});
