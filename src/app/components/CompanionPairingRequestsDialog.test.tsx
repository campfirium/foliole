import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const pairingHookMocks = vi.hoisted(() => ({
  state: null as null | Record<string, unknown>,
  useDesktopCompanionPairingRequests: vi.fn()
}));

vi.mock('../../shared/platform/useDesktopCompanionPairingRequests', () => ({
  useDesktopCompanionPairingRequests: pairingHookMocks.useDesktopCompanionPairingRequests
}));

import { CompanionPairingRequestsDialog } from './CompanionPairingRequestsDialog';

beforeEach(() => {
  pairingHookMocks.state = {
    approveRequest: vi.fn().mockResolvedValue(undefined),
    disableSync: vi.fn().mockResolvedValue(undefined),
    enableSync: vi.fn().mockResolvedValue(undefined),
    error: null,
    isDesktopRuntime: true,
    isLoading: false,
    overview: {
      pending_requests: [
        {
          client_address: '192.168.1.22',
          device_id: 'android-1',
          device_kind: 'android-capacitor',
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

it('shows a persistent allow or reject pairing dialog', () => {
  render(<CompanionPairingRequestsDialog />);

  expect(screen.getByText('Pair with Foliole client?')).toBeInTheDocument();
  expect(screen.getByText('A device wants to sync with this desktop.')).toBeInTheDocument();
  expect(screen.getByText('(Android)')).toBeInTheDocument();
  expect(screen.getByText('192.168.1.22')).toBeInTheDocument();
  expect(screen.queryByText('System')).not.toBeInTheDocument();
  expect(screen.queryByText('Address')).not.toBeInTheDocument();
  expect(screen.getByText('Pixel 9')).toBeInTheDocument();
  expect(screen.queryByText(/android-1|requested/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Allow' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open settings' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Review later' })).not.toBeInTheDocument();
});

it('keeps the request visible after escape so it cannot be lost accidentally', () => {
  render(<CompanionPairingRequestsDialog />);

  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

  expect(screen.getByText('Pair with Foliole client?')).toBeInTheDocument();
});

it('routes allow and reject actions to the selected request', () => {
  render(<CompanionPairingRequestsDialog />);

  fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
  expect(pairingHookMocks.state?.approveRequest).toHaveBeenCalledWith('pair-request-1');

  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  expect(pairingHookMocks.state?.rejectRequest).toHaveBeenCalledWith('pair-request-1');
});
