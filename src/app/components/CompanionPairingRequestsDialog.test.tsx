import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const pairingHookMocks = vi.hoisted(() => ({
  useDesktopCompanionPairingRequests: vi.fn()
}));

vi.mock('../../shared/platform/useDesktopCompanionPairingRequests', () => ({
  useDesktopCompanionPairingRequests: pairingHookMocks.useDesktopCompanionPairingRequests
}));

import { CompanionPairingRequestsDialog } from './CompanionPairingRequestsDialog';

beforeEach(() => {
  pairingHookMocks.useDesktopCompanionPairingRequests.mockReturnValue({
    approveRequest: vi.fn().mockResolvedValue(undefined),
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

it('opens companion sync settings from the pairing dialog', () => {
  const onOpenCompanionSyncSettings = vi.fn();

  render(
    <CompanionPairingRequestsDialog onOpenCompanionSyncSettings={onOpenCompanionSyncSettings} />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));

  expect(onOpenCompanionSyncSettings).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Pixel 9')).not.toBeInTheDocument();
});

it('snoozes visible requests when reviewed later', () => {
  render(<CompanionPairingRequestsDialog onOpenCompanionSyncSettings={() => undefined} />);

  fireEvent.click(screen.getByRole('button', { name: 'Review later' }));

  expect(screen.queryByText('Pixel 9')).not.toBeInTheDocument();
});
