import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CompanionHandoffReminderRuntime } from './CompanionHandoffReminderRuntime';
import { CompanionSyncContent } from './CompanionSyncContent';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const protocol = {
  capabilities: ['lan-sync-v1'],
  max_supported_version: 1,
  min_supported_version: 1,
  version: 1
};
const usablePairingMetadata = {
  negotiated_protocol_version: 1,
  remote_protocol: protocol,
  sync_usable: true
};

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

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
      paired_at: null,
      primary_device_id: null
    },
    pairingStatus: 'idle',
    pendingPairRequest: null,
    pullFromDesktop: vi.fn(async () => undefined),
    removeRememberedTarget: vi.fn(async () => undefined),
    requestPrimaryDeviceTakeover: vi.fn(async () => undefined),
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
    syncProgress: null,
    status: 'idle'
  } as unknown as ReturnType<typeof useCompanionWorkspaceSync>;
}

function TestSyncContent(props: ComponentProps<typeof CompanionSyncContent>) {
  return (
    <CompanionHandoffReminderRuntime workspaceSync={props.workspaceSync}>
      <CompanionSyncContent {...props} />
    </CompanionHandoffReminderRuntime>
  );
}

describe('CompanionSyncContent', () => {
  it('does not start discovery before the user asks to connect', () => {
    const workspaceSync = createWorkspaceSync();

    render(<TestSyncContent workspaceSync={workspaceSync} />);

    expect(screen.getByRole('button', { name: 'Connect another device' })).toBeInTheDocument();
    expect(workspaceSync.checkDesktop).not.toHaveBeenCalled();
  });


  it('hides handoff reminder settings before pairing', () => {
    const workspaceSync = createWorkspaceSync();

    render(<TestSyncContent workspaceSync={workspaceSync} />);

    expect(screen.queryByText('Handoff reminders')).not.toBeInTheDocument();
  });

  it('shows and persists mobile handoff reminder settings after pairing', () => {
    const workspaceSync = createWorkspaceSync();
    workspaceSync.pairingState = {
      ...usablePairingMetadata,
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Android Emulator',
      is_paired: true,
      paired_at: '2026-04-24T10:03:00.000Z',
      primary_device_id: 'device-desktop'
    };

    render(<TestSyncContent page="syncHandoff" workspaceSync={workspaceSync} />);

    expect(screen.getByText('Enable reminders')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Short reminder'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Daily reminder'), { target: { value: '21:00' } });

    expect(JSON.parse(window.localStorage.getItem('foliole-companion-handoff-reminder-settings') ?? '{}')).toEqual({
      fixedTime: '21:00',
      shortDelay: '5'
    });
  });

  it('keeps discovery quiet after an error until the user tries again', async () => {
    vi.useFakeTimers();
    const workspaceSync = createWorkspaceSync();
    workspaceSync.checkDesktop = vi.fn(async () => {
      throw new Error('not ready');
    });

    const { rerender } = render(<TestSyncContent workspaceSync={workspaceSync} />);

    rerender(<TestSyncContent workspaceSync={{ ...workspaceSync, error: 'No desktop sync device found.' }} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(workspaceSync.checkDesktop).not.toHaveBeenCalled();
  });
});

function pairedWorkspaceSync() {
  const workspaceSync = createWorkspaceSync();
  workspaceSync.pairingState = {
    ...usablePairingMetadata,
    device_id: 'android-test-device',
    device_kind: 'android-capacitor',
    device_name: 'Android Emulator',
    is_paired: true,
    paired_at: '2026-04-24T10:03:00.000Z',
    primary_device_id: 'device-desktop',
    remote_peer_id: 'device-desktop',
    remote_peer_name: 'MacBook Pro',
    remote_peer_platform: 'macOS'
  };
  return workspaceSync;
}

function testShowsSyncStatusDetails() {
  const workspaceSync = pairedWorkspaceSync();
  workspaceSync.state = {
    ...workspaceSync.state,
    endpoint_url: 'http://10.0.2.2:38641',
    last_synced_at: '2026-04-24T10:04:00.000Z',
    sync_events: [{
      endpoint_url: 'http://10.0.2.2:38641',
      id: 'sync-event-1',
      message: 'Sync fully completed; downloaded 1 topic body in this sync.',
      occurred_at: '2026-04-24T10:04:00.000Z',
      status: 'completed'
    }]
  };

  render(<TestSyncContent workspaceSync={workspaceSync} />);

  expect(screen.getByText('Last sync')).toBeInTheDocument();
  expect(screen.getByText('MacBook Pro (macOS)')).toBeInTheDocument();
  expect(screen.getByText('Activity')).toBeInTheDocument();
  expect(screen.getByText('Downloaded 1 topic body in this sync.')).toBeInTheDocument();
  expect(screen.getByText(/^Checked \d/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
}

function testRequestsPrimaryTakeover() {
  const workspaceSync = pairedWorkspaceSync();
  workspaceSync.state = {
    ...workspaceSync.state,
    endpoint_url: 'http://10.0.2.2:38641'
  };

  render(<TestSyncContent workspaceSync={workspaceSync} />);
  fireEvent.click(screen.getByRole('button', { name: 'Set as primary device' }));

  expect(workspaceSync.requestPrimaryDeviceTakeover).toHaveBeenCalledWith('http://10.0.2.2:38641');
}

async function testCompletesApprovedPairing() {
  vi.useFakeTimers();
  const workspaceSync = createWorkspaceSync();
  workspaceSync.completePairing = vi.fn(async () => ({
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Android companion',
      is_paired: true,
      ...usablePairingMetadata,
      paired_at: '2026-04-24T10:03:00.000Z',
      primary_device_id: 'device-desktop'
  }));
  workspaceSync.pendingPairRequest = {
    endpointUrl: 'http://192.168.1.8:38641',
    expiresAt: '2026-04-24T10:02:00.000Z',
    pairRequestId: 'pair-request-1',
    remotePeerId: 'device-desktop',
    remotePeerName: 'Desktop',
    remotePeerPlatform: 'macOS'
  };
  workspaceSync.pairingStatus = 'awaiting-approval';

  render(<TestSyncContent workspaceSync={workspaceSync} />);

  await act(async () => {
    await Promise.resolve();
  });

  expect(workspaceSync.completePairing).toHaveBeenCalled();
  expect(workspaceSync.pullFromDesktop).toHaveBeenCalledWith('http://192.168.1.8:38641');
}

async function testKeepsApprovalPollingBelowDesktopRateLimit() {
  vi.useFakeTimers();
  const workspaceSync = createWorkspaceSync();
  workspaceSync.pendingPairRequest = {
    endpointUrl: 'http://192.168.1.8:38641',
    expiresAt: '2026-04-24T10:02:00.000Z',
    pairRequestId: 'pair-request-1',
    remotePeerId: 'device-desktop',
    remotePeerName: 'Desktop',
    remotePeerPlatform: 'macOS'
  };
  workspaceSync.pairingStatus = 'awaiting-approval';

  render(<TestSyncContent workspaceSync={workspaceSync} />);
  await act(async () => vi.advanceTimersByTimeAsync(60_000));

  expect(workspaceSync.completePairing).toHaveBeenCalledTimes(9);
}

describe('CompanionSyncContent paired flow', () => {
  it('shows sync status details for a paired device', testShowsSyncStatusDetails);
  it('lets a synced secondary device request primary takeover', testRequestsPrimaryTakeover);
  it('automatically completes pairing after desktop approval', testCompletesApprovedPairing);
  it('keeps approval polling below the desktop completion rate limit', testKeepsApprovalPollingBelowDesktopRateLimit);
});
