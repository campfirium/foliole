import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const pairingHookMocks = vi.hoisted(() => ({
  useDesktopCompanionPairingRequests: vi.fn()
}));

vi.mock('../../../../shared/platform/useDesktopCompanionPairingRequests', () => ({
  useDesktopCompanionPairingRequests: pairingHookMocks.useDesktopCompanionPairingRequests
}));

import { SettingsCompanionSyncSection } from './SettingsCompanionSyncSection';

beforeEach(() => {
  pairingHookMocks.useDesktopCompanionPairingRequests.mockReturnValue({
    approveRequest: vi.fn().mockResolvedValue(undefined),
    clearPairedDevices: vi.fn().mockResolvedValue(undefined),
    disableSync: vi.fn().mockResolvedValue(undefined),
    enableSync: vi.fn().mockResolvedValue(undefined),
    error: null,
    isDesktopRuntime: true,
    isLoading: false,
    overview: {
      pending_requests: [
        {
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
  });
});

it('renders device sync actions with user-facing labels', async () => {
  render(<SettingsCompanionSyncSection />);

  expect(screen.getByText('Pixel 9')).toBeInTheDocument();
  expect(screen.getByText('Device sync is on. Paired devices can reconnect quietly while this desktop is running.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  fireEvent.click(screen.getByRole('button', { name: 'Forget connected devices' }));
  fireEvent.click(screen.getByRole('button', { name: 'Turn off device sync' }));

  const hookState = pairingHookMocks.useDesktopCompanionPairingRequests.mock.results[0]?.value;
  await waitFor(() => {
    expect(hookState.approveRequest).toHaveBeenCalledWith('pair-request-1');
    expect(hookState.rejectRequest).toHaveBeenCalledWith('pair-request-1');
    expect(hookState.clearPairedDevices).toHaveBeenCalled();
    expect(hookState.disableSync).toHaveBeenCalled();
  });
});
