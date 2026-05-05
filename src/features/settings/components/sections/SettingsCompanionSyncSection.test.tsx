import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const pairingHookMocks = vi.hoisted(() => ({
  state: null as null | Record<string, unknown>,
  useDesktopCompanionPairingRequests: vi.fn()
}));

vi.mock('../../../../shared/platform/useDesktopCompanionPairingRequests', () => ({
  useDesktopCompanionPairingRequests: pairingHookMocks.useDesktopCompanionPairingRequests
}));

import { SettingsCompanionSyncSection } from './SettingsCompanionSyncSection';

beforeEach(() => {
  pairingHookMocks.state = {
    approveRequest: vi.fn().mockResolvedValue(undefined),
    clearPairedDevices: vi.fn().mockResolvedValue(undefined),
    removePairedDevice: vi.fn().mockResolvedValue(undefined),
    disableSync: vi.fn().mockResolvedValue(undefined),
    enableSync: vi.fn().mockResolvedValue(undefined),
    error: null,
    isDesktopRuntime: true,
    isLoading: false,
    overview: {
      paired_devices: [
        {
          client_address: '192.168.1.22',
          device_id: 'android-1',
          device_kind: 'android-capacitor',
          device_name: 'Pixel 9',
          paired_at: '2026-04-24T10:03:00.000Z'
        }
      ],
      pending_requests: [
        {
          client_address: '192.168.1.22',
          device_id: 'android-1',
          device_kind: 'android',
          device_name: 'Pixel 9',
          expires_at: '2026-04-24T10:02:00.000Z',
          pair_request_id: 'pair-request-1',
          requested_at: '2026-04-24T10:00:00.000Z',
          status: 'pending'
        }
      ],
      server_status: {
        advertised_urls: ['http://127.0.0.1:38641'],
        last_error: null,
        paired_device_count: 1,
        pending_pair_request_count: 1,
        port: 38641,
        state: 'running'
      },
      sync_enabled: true
    },
    pendingActionId: null,
    refresh: vi.fn().mockResolvedValue(undefined),
    rejectRequest: vi.fn().mockResolvedValue(undefined)
  };
  pairingHookMocks.useDesktopCompanionPairingRequests.mockReturnValue(pairingHookMocks.state);
});

it('renders compact sync controls', async () => {
  render(<SettingsCompanionSyncSection />);

  expect(screen.getByText(/Turn on desktop sync/)).toBeInTheDocument();
  expect(screen.getByText('Connected devices')).toBeInTheDocument();
  expect(screen.getByText(/Turn on sync for this desktop/)).toBeInTheDocument();
  expect(screen.getByText('Pixel 9')).toBeInTheDocument();
  expect(screen.getByText('(Android)')).toBeInTheDocument();
  expect(screen.getByText('192.168.1.22')).toBeInTheDocument();
  expect(screen.getByRole('list')).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.queryByText('1')).not.toBeInTheDocument();
  expect(screen.queryByText('Waiting devices')).not.toBeInTheDocument();
  expect(screen.queryByText('Enabled')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Sync' }).className).toContain('bg-settings-switch-on');
  expect(screen.getByRole('switch', { name: 'Sync' }).parentElement?.className).toContain('flex-[0_0_auto]');

  fireEvent.click(screen.getByRole('switch', { name: 'Sync' }));

  const hookState = pairingHookMocks.useDesktopCompanionPairingRequests.mock.results[0]?.value;
  await waitFor(() => {
    expect(hookState.disableSync).toHaveBeenCalled();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  await waitFor(() => {
    expect(pairingHookMocks.state?.removePairedDevice).toHaveBeenCalledWith('android-1');
  });
});
