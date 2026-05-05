import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionSyncPanel } from './CompanionSyncPanel';

function createConnectedProps() {
  return {
    bootstrapState: {
      booted_at: '2026-04-22T09:05:00.000Z',
      database_path: 'foliole-companion-preview.db',
      database_ready: true,
      device_id: 'android-test-device',
      runtime_kind: 'android-capacitor' as const
    },
    desktopDiscoveries: [],
    desktopDiscovery: null,
    endpointUrl: 'http://10.0.2.2:38641',
    error: null,
    handoffReminderSettings: {
      fixedTime: null,
      shortDelay: 'off' as const
    },
    lastSyncedAt: null,
    rememberedTargets: [],
    syncedTopicCount: 0,
    syncConflictCount: 0,
    syncEvents: [],
    onCancelPairing: vi.fn(),
    onCheckDesktop: vi.fn(async () => undefined),
    onChangeHandoffReminderSettings: vi.fn(),
    onClearError: vi.fn(),
    onCompletePairing: vi.fn(async () => undefined),
    onPull: vi.fn(async () => undefined),
    onRemoveRememberedTarget: vi.fn(async () => undefined),
    onRequestPairing: vi.fn(async () => undefined),
    onSaveEndpoint: vi.fn(async () => undefined),
    onOpenSettingsPage: vi.fn(),
    page: 'sync' as const,
    pairingRequest: null,
    pairingState: {
      device_id: 'android-test-device',
      device_kind: 'android-capacitor',
      device_name: 'Android companion',
      is_paired: true,
      paired_at: '2026-04-22T09:00:00.000Z'
    },
    pairingStatus: 'idle' as const,
    status: 'idle' as const
  };
}

describe('CompanionSyncPanel connected state', () => {
  it('shows a paired state without setup controls', () => {
    render(<CompanionSyncPanel {...createConnectedProps()} />);

    expect(screen.getByText('Last sync')).toBeInTheDocument();
    expect(screen.getByText('Handoff reminders')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect another device' })).not.toBeInTheDocument();
  });

  it('shows pending sync conflicts when the local database has them', () => {
    render(<CompanionSyncPanel {...createConnectedProps()} syncConflictCount={2} />);

    expect(screen.getByText('Issues to resolve')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('separates the current connection state from older sync activity', () => {
    const props = createConnectedProps();
    render(
      <CompanionSyncPanel
        {...props}
        lastSyncedAt="2026-04-29T02:24:44.000Z"
        pairingState={{
          ...props.pairingState,
          device_name: 'Android Emulator'
        }}
        syncEvents={[
          {
            endpoint_url: 'http://10.0.2.2:38641',
            id: 'completed-event',
            message: 'Auto sync completed.',
            occurred_at: '2026-04-29T02:24:44.000Z',
            status: 'completed'
          },
          {
            endpoint_url: 'http://10.0.2.2:38641',
            id: 'failed-event',
            message: 'Desktop sync timed out while fetching content blobs.',
            occurred_at: '2026-04-29T02:18:33.000Z',
            status: 'failed'
          }
        ]}
      />
    );

    expect(screen.getByText('Last sync')).toBeInTheDocument();
    expect(screen.queryByText('Synced')).not.toBeInTheDocument();
    screen.getByRole('button', { name: /Activity/ }).click();
    expect(props.onOpenSettingsPage).toHaveBeenCalledWith('syncActivity');
  });

  it('does not call manual sync completion automatic', () => {
    render(
      <CompanionSyncPanel
        {...createConnectedProps()}
        lastSyncedAt="2026-04-29T02:24:44.000Z"
        syncEvents={[
          {
            endpoint_url: 'http://10.0.2.2:38641',
            id: 'manual-completed-event',
            message: 'Sync completed.',
            occurred_at: '2026-04-29T02:24:44.000Z',
            status: 'completed'
          }
        ]}
      />
    );

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('Completed automatically')).not.toBeInTheDocument();
  });

  it('shows older failures as neutral history after a later completed sync', () => {
    const props = createConnectedProps();
    render(
      <CompanionSyncPanel
        {...props}
        page="syncActivity"
        syncEvents={[
          {
            endpoint_url: 'http://10.0.2.2:38641',
            id: 'completed-event',
            message: 'Auto sync completed.',
            occurred_at: '2026-04-29T02:24:44.000Z',
            status: 'completed'
          },
          {
            endpoint_url: 'http://10.0.2.2:38641',
            id: 'failed-event',
            message: 'Desktop sync timed out while fetching content blobs.',
            occurred_at: '2026-04-29T02:18:33.000Z',
            status: 'failed'
          }
        ]}
      />
    );

    expect(screen.getByText('Completed auto sync')).toBeInTheDocument();
    const oldFailure = screen.getByText('Earlier sync attempt did not complete');
    expect(oldFailure).toBeInTheDocument();
    expect(oldFailure.className).not.toContain('text-error');
  });

  it('shows a healthy backlog sync pass without claiming strict completion', () => {
    render(
      <CompanionSyncPanel
        {...createConnectedProps()}
        syncEvents={[
          {
            endpoint_url: 'http://10.0.2.2:38641',
            id: 'backlog-event',
            message: 'Some topic bodies are still being cached.',
            occurred_at: '2026-04-29T02:24:44.000Z',
            status: 'skipped'
          }
        ]}
      />
    );

    expect(screen.getByText('Last sync')).toBeInTheDocument();
    expect(screen.getByText('Some topic bodies are still being cached.')).toBeInTheDocument();
    expect(screen.queryByText('No completed sync yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Completed automatically')).not.toBeInTheDocument();
  });

  it('shows older failures as neutral history after a later backlog sync pass', () => {
    render(
      <CompanionSyncPanel
        {...createConnectedProps()}
        page="syncActivity"
        syncEvents={[
          {
            endpoint_url: 'http://10.0.2.2:38641',
            id: 'backlog-event',
            message: 'Some topic bodies are still being cached.',
            occurred_at: '2026-04-29T02:24:44.000Z',
            status: 'skipped'
          },
          {
            endpoint_url: 'http://10.0.2.2:38641',
            id: 'failed-event',
            message: 'Desktop sync timed out while fetching content blobs.',
            occurred_at: '2026-04-29T02:18:33.000Z',
            status: 'failed'
          }
        ]}
      />
    );

    expect(screen.getByText('Some topic bodies are still being cached.')).toBeInTheDocument();
    const oldFailure = screen.getByText('Earlier sync attempt did not complete');
    expect(oldFailure).toBeInTheDocument();
    expect(oldFailure.className).not.toContain('text-error');
  });
});
