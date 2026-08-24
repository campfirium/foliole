import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncGroupRows, useSyncGroupProviderState } from './CompanionSyncGroupRows';

const providerMocks = vi.hoisted(() => ({ approve: vi.fn(), load: vi.fn(), reject: vi.fn(), setPaused: vi.fn() }));
const group = {
  created_at: '2026-08-08T00:00:00.000Z', created_by_host_name: 'desktop-1', display_name: 'Studio',
  group_id: 'group-1', local_host_name: 'Pixel', local_member_state: 'active' as const,
  members: [{
    approved_by_host_name: 'desktop-1', authorization_id: 'request-1', host_name: 'Pixel',
    host_platform: 'android-capacitor', joined_at: '2026-08-08T00:00:00.000Z', state: 'active' as const
  }],
  timeline_id: 'timeline-1'
};

vi.mock('../shared/platform/companion/sync/syncGroupProvider', () => ({
  approveCompanionSyncGroupJoinRequest: providerMocks.approve,
  loadCompanionSyncGroupProviderState: providerMocks.load,
  rejectCompanionSyncGroupJoinRequest: providerMocks.reject,
  setCompanionSyncPaused: providerMocks.setPaused
}));

function Subject() {
  return <CompanionSyncGroupRows group={group} provider={useSyncGroupProviderState()} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  const state = {
    lifecycle_active: true, participating: true,
    pending_requests: [{
      host_name: 'Waiting phone', host_platform: 'win32', pair_request_id: 'request-2',
      requested_at: '2026-08-24T00:00:00.000Z'
    }], port: 38641,
    state: 'running', sync_enabled: true, sync_paused: false
  };
  providerMocks.load.mockResolvedValue(state);
  providerMocks.approve.mockResolvedValue({ ...state, pending_requests: [] });
  providerMocks.reject.mockResolvedValue({ ...state, pending_requests: [] });
  providerMocks.setPaused.mockResolvedValue({ ...state, sync_paused: true });
});

it('shows persistent membership and keeps Leave independent from participation controls', async () => {
  renderWithLocalization(<Subject />);

  expect(screen.getByText("Studio's Sync Group")).toBeInTheDocument();
  expect(screen.getByText('Pixel')).toBeInTheDocument();
  expect(await screen.findByText('Waiting phone')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('companion-sync-group-approve'));
  await waitFor(() => expect(providerMocks.approve).toHaveBeenCalledWith('request-2'));
  await waitFor(() => expect(screen.queryByText('Waiting phone')).not.toBeInTheDocument());
  fireEvent.click(await screen.findByRole('button', { name: 'Pause Sync' }));
  expect(providerMocks.setPaused).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'Leave Sync Group' }));
  expect(screen.getByText(/Topics and attachments stay on this device/)).toBeInTheDocument();
  expect(screen.getByTestId('companion-sync-group-leave-confirm')).toBeInTheDocument();
});

it('keeps a join request actionable when approval fails', async () => {
  providerMocks.approve.mockRejectedValue(new Error('native approval failed'));
  renderWithLocalization(<Subject />);

  fireEvent.click(await screen.findByTestId('companion-sync-group-approve'));

  expect(await screen.findByRole('alert')).toHaveTextContent('This request could not be updated. Try again.');
  expect(screen.getByText('Waiting phone')).toBeInTheDocument();
  expect(screen.getByTestId('companion-sync-group-approve')).toBeEnabled();
});
