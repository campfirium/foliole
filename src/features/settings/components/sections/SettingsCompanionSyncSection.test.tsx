import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { useDesktopCompanionPairingRequests } from '../../../../shared/platform/useDesktopCompanionPairingRequests';

import { SettingsCompanionSyncSection } from './SettingsCompanionSyncSection';

const companionPairingMock = vi.hoisted(() => ({
  useDesktopCompanionPairingRequests: vi.fn()
}));

vi.mock('../../../../shared/platform/useDesktopCompanionPairingRequests', () => companionPairingMock);

type PairingState = ReturnType<typeof useDesktopCompanionPairingRequests>;

function createState(overrides: Partial<PairingState> = {}): PairingState {
  return {
    approveRequest: vi.fn(),
    clearPairedDevices: vi.fn(),
    disableSync: vi.fn(),
    enableSync: vi.fn(),
    error: null,
    isDesktopRuntime: true,
    isLoading: false,
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
      sync_enabled: true
    },
    pendingActionId: null,
    refresh: vi.fn(),
    rejectRequest: vi.fn(),
    removePairedDevice: vi.fn(),
    setDesktopAsPrimaryDevice: vi.fn(),
    ...overrides
  };
}

beforeEach(() => {
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState());
});

it('shows the current primary device role in sync settings', () => {
  render(<SettingsCompanionSyncSection />);

  expect(screen.getByText('Device role')).toBeInTheDocument();
  expect(screen.getByText('Primary device')).toBeInTheDocument();
  expect(screen.getByText('Current primary')).toBeInTheDocument();
  expect(screen.getByText('This desktop runs sync and external sources for paired devices.')).toBeInTheDocument();
});

it('lets a secondary desktop become the primary device from sync settings', async () => {
  const setDesktopAsPrimaryDevice = vi.fn();
  companionPairingMock.useDesktopCompanionPairingRequests.mockReturnValue(createState({
    overview: {
      ...createState().overview,
      primary_device_state: {
        can_initiate_takeover: false,
        local_role: 'secondary',
        primary_device_id: 'device-android',
        source: 'committed-primary-device',
        takeover_blocked_reasons: ['sync-latest-confirmation-missing']
      }
    },
    setDesktopAsPrimaryDevice
  }));

  render(<SettingsCompanionSyncSection />);
  fireEvent.click(screen.getByRole('button', { name: 'Set as primary device' }));

  expect(setDesktopAsPrimaryDevice).toHaveBeenCalledTimes(1);
});
