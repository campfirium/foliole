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

it('renders compact sync controls', async () => {
  render(<SettingsCompanionSyncSection />);

  expect(screen.getByText(/Turn on desktop sync/)).toBeInTheDocument();
  expect(screen.getByText('Connected devices')).toBeInTheDocument();
  expect(screen.getByText(/Turn on sync for this desktop/)).toBeInTheDocument();
  expect(screen.getByText('1')).toBeInTheDocument();
  expect(screen.queryByText('Pixel 9')).not.toBeInTheDocument();
  expect(screen.queryByText('Waiting devices')).not.toBeInTheDocument();
  expect(screen.queryByText('Enabled')).not.toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Sync' }).className).toContain('bg-settings-switch-on');
  expect(screen.getByRole('switch', { name: 'Sync' }).parentElement?.className).toContain('flex-[0_0_auto]');

  fireEvent.click(screen.getByRole('switch', { name: 'Sync' }));

  const hookState = pairingHookMocks.useDesktopCompanionPairingRequests.mock.results[0]?.value;
  await waitFor(() => {
    expect(hookState.disableSync).toHaveBeenCalled();
  });
});
