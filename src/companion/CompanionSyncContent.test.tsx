import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CompanionSyncContent } from './CompanionSyncContent';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

function createWorkspaceSync() {
  return {
    bootstrapState: {
      booted_at: '2026-04-22T09:05:00.000Z',
      database_path: 'foliole-companion-preview.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor'
    },
    checkDesktop: vi.fn(async () => undefined),
    clearError: vi.fn(),
    completePairing: vi.fn(async () => undefined),
    desktopDiscoveries: [],
    desktopDiscovery: null,
    error: null,
    pairingState: {
      device_id: null,
      device_kind: null,
      device_name: null,
      is_paired: false,
      paired_at: null
    },
    pairingStatus: 'idle',
    pendingPairRequest: null,
    pullFromDesktop: vi.fn(async () => undefined),
    removeRememberedTarget: vi.fn(async () => undefined),
    requestPairing: vi.fn(async () => undefined),
    saveEndpoint: vi.fn(async () => undefined),
    state: {
      endpoint_url: null,
      last_synced_at: null,
      remembered_targets: [],
      sync_events: [],
      sync_onboarding_status: 'pending',
      workspace_snapshot: null
    },
    status: 'idle'
  } as unknown as ReturnType<typeof useCompanionWorkspaceSync>;
}

describe('CompanionSyncContent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts desktop discovery automatically for a new unpaired device', async () => {
    const workspaceSync = createWorkspaceSync();

    render(<CompanionSyncContent workspaceSync={workspaceSync} />);

    await waitFor(() => {
      expect(workspaceSync.checkDesktop).toHaveBeenCalledWith('http://10.0.2.2:38641');
    });
  });

  it('keeps retrying discovery while the setup screen remains unpaired', async () => {
    vi.useFakeTimers();
    const workspaceSync = createWorkspaceSync();
    workspaceSync.checkDesktop = vi.fn(async () => {
      throw new Error('not ready');
    });

    const { rerender } = render(<CompanionSyncContent workspaceSync={workspaceSync} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(workspaceSync.checkDesktop).toHaveBeenCalledTimes(1);

    rerender(<CompanionSyncContent workspaceSync={{ ...workspaceSync, error: 'No desktop sync device found.' }} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(workspaceSync.checkDesktop).toHaveBeenCalledTimes(2);
  });



  it('shows sync status details for a paired device', () => {
    const workspaceSync = createWorkspaceSync();
    workspaceSync.pairingState = {
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Android Emulator',
      is_paired: true,
      paired_at: '2026-04-24T10:03:00.000Z'
    };
    workspaceSync.state = {
      ...workspaceSync.state,
      endpoint_url: 'http://10.0.2.2:38641',
      last_synced_at: '2026-04-24T10:04:00.000Z',
      sync_events: [{
        endpoint_url: 'http://10.0.2.2:38641',
        id: 'sync-event-1',
        message: 'Sync completed.',
        occurred_at: '2026-04-24T10:04:00.000Z',
        status: 'completed'
      }]
    };

    render(<CompanionSyncContent workspaceSync={workspaceSync} />);

    expect(screen.getByText('Sync status')).toBeInTheDocument();
    expect(screen.getByText('Last sync')).toBeInTheDocument();
    expect(screen.getByText('Android Emulator (Android)')).toBeInTheDocument();
    expect(screen.getByText('Sync log')).toBeInTheDocument();
    expect(screen.getByText('Sync completed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeInTheDocument();
  });

  it('automatically completes pairing after desktop approval', async () => {
    vi.useFakeTimers();
    const workspaceSync = createWorkspaceSync();
    workspaceSync.completePairing = vi.fn(async () => ({
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Android companion',
      is_paired: true,
      paired_at: '2026-04-24T10:03:00.000Z'
    }));
    workspaceSync.pendingPairRequest = {
      endpointUrl: 'http://192.168.1.8:38641',
      expiresAt: '2026-04-24T10:02:00.000Z',
      pairRequestId: 'pair-request-1'
    };
    workspaceSync.pairingStatus = 'awaiting-approval';

    render(<CompanionSyncContent workspaceSync={workspaceSync} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(workspaceSync.completePairing).toHaveBeenCalled();
    expect(workspaceSync.pullFromDesktop).toHaveBeenCalledWith('http://192.168.1.8:38641');
  });

});
