import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import type { useDesktopCompanionPairingRequests } from '../../../../shared/platform/useDesktopCompanionPairingRequests';

import { SettingsCompanionSyncSection } from './SettingsCompanionSyncSection';

const companionPairingMock = vi.hoisted(() => ({
  useDesktopCompanionPairingRequests: vi.fn()
}));
const confirmationMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../shared/platform/useDesktopCompanionPairingRequests', () => companionPairingMock);
vi.mock('../../../../shared/ui', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../../shared/ui')>(),
  requestAppConfirmation: confirmationMock
}));

type PairingState = ReturnType<typeof useDesktopCompanionPairingRequests>;

function createState(overrides: Partial<PairingState> = {}): PairingState {
  return {
    approveRequest: vi.fn(),
    createSyncGroup: vi.fn(),
    clearPairedDevices: vi.fn(),
    completeSyncGroupJoin: vi.fn(),
    discoverSyncGroups: vi.fn(),
    disableSync: vi.fn(),
    enableSync: vi.fn(),
    error: null,
    isDesktopRuntime: true,
    isLoading: false,
    leaveSyncGroup: vi.fn(),
    overview: {
      paired_devices: [],
      pending_requests: [],
      primary_device_state: {
        can_initiate_takeover: false,
        local_role: 'primary',
        primary_device_id: 'device-desktop',
        source: 'desktop-paired-default',
        takeover_blocked_reasons: []
      },
      server_status: {
        advertised_urls: [],
        last_error: null,
        paired_device_count: 0,
        pending_pair_request_count: 0,
        port: null,
        state: 'stopped'
      },
      participating: true,
      sync_enabled: true,
      sync_paused: false
    },
    pendingActionId: null,
    pauseSync: vi.fn(),
    refresh: vi.fn(),
    rejectRequest: vi.fn(),
    removePairedDevice: vi.fn(),
    removeSyncGroupMember: vi.fn(),
    requestSyncGroupJoin: vi.fn(),
    resumeSync: vi.fn(),
    ...overrides
  };
}

beforeEach(() => {
  confirmationMock.mockReset().mockResolvedValue(false);
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState());
});

it('offers to create a Sync Group when this desktop has none', () => {
  renderWithLocalization(<SettingsCompanionSyncSection />);

  expect(screen.getByText('Sync Groups')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create Sync Group' })).toBeInTheDocument();
});

it('creates a Sync Group from sync settings', async () => {
  const createSyncGroup = vi.fn();
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({
    createSyncGroup
  }));

  renderWithLocalization(<SettingsCompanionSyncSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Create Sync Group' }));

  expect(createSyncGroup).toHaveBeenCalledTimes(1);
});

it('confirms before leaving the group or removing another member', async () => {
  const leaveSyncGroup = vi.fn();
  const removeSyncGroupMember = vi.fn();
  const overview = createState().overview;
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({
    leaveSyncGroup, removeSyncGroupMember,
    overview: { ...overview, sync_group: {
      created_at: '2026-08-08T00:00:00Z', created_by_device_id: 'desktop-1', display_name: 'Studio',
      group_id: 'group-1', local_device_id: 'desktop-1', local_member_state: 'active', timeline_id: 'timeline-1',
      members: [{ approved_by_device_id: 'desktop-1', authorization_id: 'founder', device_id: 'desktop-1',
        device_kind: 'darwin', device_name: 'Studio Mac', joined_at: '2026-08-08T00:00:00Z', state: 'active' },
      { approved_by_device_id: 'desktop-1', authorization_id: 'member', device_id: 'android-1',
        device_kind: 'android-capacitor', device_name: 'A5', joined_at: '2026-08-08T01:00:00Z', state: 'active' }]
    } }
  }));
  confirmationMock.mockResolvedValue(true);
  renderWithLocalization(<SettingsCompanionSyncSection />);

  fireEvent.click(screen.getByRole('button', { name: 'Remove from Sync Group' }));
  await vi.waitFor(() => expect(removeSyncGroupMember).toHaveBeenCalledWith('android-1'));
  fireEvent.click(screen.getByRole('button', { name: 'Leave Sync Group' }));
  await vi.waitFor(() => expect(leaveSyncGroup).toHaveBeenCalledTimes(1));
  expect(confirmationMock).toHaveBeenCalledTimes(2);
});

it('requests a discovered Sync Group from its active mobile Device', () => {
  const requestSyncGroupJoin = vi.fn();
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({
    requestSyncGroupJoin,
    overview: {
      ...createState().overview,
      join_candidates: [{
        endpoint_url: 'http://192.168.1.8:43123', group_display_name: 'Studio', group_id: 'group-1',
        group_tag: 'tag-1',
        provider_device_id: 'android-b', provider_device_kind: 'android-capacitor',
        provider_device_name: 'A5', timeline_id: 'timeline-1'
      }]
    }
  }));
  renderWithLocalization(<SettingsCompanionSyncSection />);
  expect(screen.getByText("Studio's Sync Group")).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Join' }));
  expect(requestSyncGroupJoin).toHaveBeenCalledWith('http://192.168.1.8:43123');
});

it('shows that approval starts sync automatically', () => {
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({
    overview: {
      ...createState().overview,
      join_request: {
        endpoint_url: 'http://192.168.1.8:43123', expires_at: '2026-08-08T01:00:00.000Z',
        group_id: 'group-1', pair_request_id: 'request-1', status: 'pending', timeline_id: 'timeline-1'
      }
    }
  }));
  renderWithLocalization(<SettingsCompanionSyncSection />);
  expect(screen.getByText('Waiting for approval. Sync starts automatically afterward.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Finish joining' })).not.toBeInTheDocument();
});

it('approves a recognized device asking to join the Sync Group', () => {
  const approveRequest = vi.fn();
  const overview = createState().overview;
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({
    approveRequest,
    overview: {
      ...overview,
      pending_requests: [{
        client_address: '192.168.1.8', device_id: 'android-1', device_kind: 'android-capacitor',
        device_name: 'Pixel', expires_at: '2026-08-08T01:00:00.000Z', pair_request_id: 'request-1',
        requested_at: '2026-08-08T00:58:00.000Z', status: 'pending'
      }],
      sync_group: {
        created_at: '2026-08-08T00:00:00.000Z', created_by_device_id: 'desktop-1', display_name: 'Studio',
        group_id: 'group-1', local_device_id: 'desktop-1', local_member_state: 'active',
        members: [{
          approved_by_device_id: 'desktop-1',
          authorization_id: 'founder-1', device_id: 'desktop-1', device_kind: 'darwin', device_name: 'Studio',
          joined_at: '2026-08-08T00:00:00.000Z', state: 'active'
        }],
        timeline_id: 'timeline-1'
      }
    }
  }));

  renderWithLocalization(<SettingsCompanionSyncSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

  expect(approveRequest).toHaveBeenCalledWith('request-1');
});

it('disables Sync Group creation while settings are loading', () => {
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({ isLoading: true }));

  renderWithLocalization(<SettingsCompanionSyncSection />);

  expect(screen.getByRole('button', { name: 'Create Sync Group' })).toBeDisabled();
});

it('does not expose legacy paired-device transport rows', () => {
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({
    overview: {
      ...createState().overview,
      paired_devices: [{
        client_address: '192.168.1.3',
        device_id: 'ios-device',
        device_kind: 'ios-capacitor',
        device_name: 'iPhone 13 mini',
        paired_at: '2026-07-21T00:00:00.000Z'
      }]
    }
  }));

  renderWithLocalization(<SettingsCompanionSyncSection />);

  expect(screen.queryByText('Connected devices')).not.toBeInTheDocument();
  expect(screen.queryByText('iPhone 13 mini')).not.toBeInTheDocument();
});

it('shows sync server errors through the settings state surface', () => {
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({
    overview: {
      ...createState().overview,
      server_status: {
        ...createState().overview.server_status,
        last_error: 'Port unavailable.'
      }
    }
  }));

  renderWithLocalization(<SettingsCompanionSyncSection />);

  expect(screen.getByRole('alert')).toHaveTextContent('Desktop sync unavailable');
  expect(screen.getByRole('alert')).toHaveTextContent('Could not open sync. Port unavailable.');
});

it('shows Sync Group state errors through the settings state surface', () => {
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({
    error: 'Could not refresh the Sync Group.'
  }));

  renderWithLocalization(<SettingsCompanionSyncSection />);

  expect(screen.getByRole('alert')).toHaveTextContent('Sync Group unavailable');
  expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh the Sync Group.');
});
