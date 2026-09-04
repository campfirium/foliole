import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncGroupRows } from './CompanionSyncGroupRows';

const providerMocks = vi.hoisted(() => ({
  approve: vi.fn(), load: vi.fn(), reject: vi.fn(), setPaused: vi.fn(), subscribe: vi.fn()
}));

vi.mock('../shared/platform/companion/sync/syncGroupProvider', () => ({
  acceptCompanionSyncGroupJoinRequest: providerMocks.approve,
  loadCompanionSyncGroupProviderState: providerMocks.load,
  rejectCompanionSyncGroupJoinRequest: providerMocks.reject,
  setCompanionSyncPaused: providerMocks.setPaused,
  subscribeCompanionSyncGroupProviderState: providerMocks.subscribe
}));

vi.mock('./useCompanionSyncParticipation', () => ({
  useCompanionSyncParticipation: () => ({
    lifecycle_active: true, participating: true, sync_enabled: true, sync_paused: false
  })
}));

beforeEach(() => {
  vi.clearAllMocks();
  const state = {
    lifecycle_active: true, participating: true,
    pending_requests: [{
      device_name: 'Waiting client', platform: 'win32', request_id: 'request-2',
      requested_at: '2026-08-24T00:00:00.000Z'
    }], port: 38641,
    state: 'running', sync_enabled: true, sync_paused: false
  };
  providerMocks.load.mockResolvedValue(state);
  providerMocks.approve.mockResolvedValue({ ...state, pending_requests: [] });
  providerMocks.reject.mockResolvedValue({ ...state, pending_requests: [] });
  providerMocks.setPaused.mockResolvedValue({ ...state, sync_paused: true });
  providerMocks.subscribe.mockResolvedValue(() => undefined);
});

it('shows persistent membership and keeps Leave independent from participation controls', async () => {
  const onLeave = vi.fn().mockResolvedValue(undefined);
  renderWithLocalization(<CompanionSyncGroupRows group={{
    created_at: '2026-08-08T00:00:00.000Z', display_name: 'Studio', group_id: 'group-1',
    local_device_identity_key: 'device-pixel', devices: [{
      canonical_library_path: '/pixel', contract_version: 1, device_anchor: 'pixel-anchor',
      device_identity_key: 'device-pixel', device_name: 'Pixel', joined_at: '2026-08-08T00:00:00.000Z',
      last_seen_at: null, left_at: null, platform: 'android-capacitor', state: 'active',
      updated_at: '2026-08-08T00:00:00.000Z'
    }]
  }} onLeave={onLeave} />);

  expect(screen.getByText("Studio's Sync Group")).toBeInTheDocument();
  expect(screen.getByText('Pixel')).toBeInTheDocument();
  expect(await screen.findByText('Waiting client')).toBeInTheDocument();
  expect(screen.getByText('Windows')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('companion-sync-group-approve'));
  await waitFor(() => expect(providerMocks.approve).toHaveBeenCalledWith('request-2'));
  await waitFor(() => expect(screen.queryByText('Waiting client')).not.toBeInTheDocument());
  fireEvent.click(await screen.findByRole('button', { name: 'Pause Sync' }));
  expect(providerMocks.setPaused).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'Leave Sync Group' }));
  expect(screen.getByText(/Topics and attachments stay on this device/)).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('companion-sync-group-leave-confirm'));
  await waitFor(() => expect(onLeave).toHaveBeenCalledOnce());
});
