import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionSyncStatusDetails } from './CompanionSyncStatusDetails';

function renderActivity(
  events: ComponentProps<typeof CompanionSyncStatusDetails>['syncEvents'],
  overrides: Partial<Pick<ComponentProps<typeof CompanionSyncStatusDetails>, 'status' | 'syncProgress'>> = {}
) {
  render(
    <CompanionSyncStatusDetails
      endpointUrl="http://10.0.2.2:38641"
      lastSyncedAt={null}
      onOpenPage={vi.fn()}
      page="syncActivity"
      pairingState={{
        device_id: 'android-test-device',
        device_kind: 'android-capacitor',
        device_name: 'Android companion',
        is_paired: true,
        paired_at: '2026-04-22T09:00:00.000Z'
      }}
      status={overrides.status ?? 'idle'}
      syncConflictCount={0}
      syncEvents={events}
      syncProgress={overrides.syncProgress ?? null}
    />
  );
}

function runFinishedEvent() {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    id: 'run-1-finished',
    kind: 'run_finished' as const,
    message: 'Sync checked; 2 device changes need review before sending.',
    occurred_at: '2026-05-07T23:13:00.000Z',
    result: 'blocked' as const,
    run_id: 'run-1',
    started_at: '2026-05-07T23:12:00.000Z',
    status: 'skipped' as const
  };
}

function runStartedEvent() {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    id: 'run-1-started',
    kind: 'run_started' as const,
    message: 'Auto sync started.',
    occurred_at: '2026-05-07T23:12:00.000Z',
    run_id: 'run-1',
    started_at: '2026-05-07T23:12:00.000Z',
    status: 'started' as const
  };
}

describe('CompanionSyncStatusDetails activity', () => {
  it('does not show started sync events as historical results', () => {
    renderActivity([{
      endpoint_url: 'http://10.0.2.2:38641',
      id: 'auto-started',
      message: 'Auto sync started.',
      occurred_at: '2026-05-07T23:12:00.000Z',
      status: 'started'
    }]);

    expect(screen.queryByText('Auto sync started.')).not.toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('No completed sync activity yet.')).toBeInTheDocument();
  });

  it('shows one final blocked run instead of its started event', () => {
    renderActivity([runFinishedEvent(), runStartedEvent()]);

    expect(screen.getByText('Sync blocked; 2 device changes need review before sending.')).toBeInTheDocument();
    expect(screen.queryByText('Auto sync started.')).not.toBeInTheDocument();
  });

  it('shows the concrete failed sync reason returned by the native bridge', () => {
    renderActivity([{
      endpoint_url: 'http://10.0.2.2:38641',
      id: 'bridge-failed',
      message: 'Desktop HTTP request failed. Cause: ConnectException: Failed to connect to /10.0.2.2:38641.',
      occurred_at: '2026-05-07T23:12:30.000Z',
      status: 'failed'
    }]);

    expect(screen.getByText(
      'Desktop HTTP request failed. Cause: ConnectException: Failed to connect to /10.0.2.2:38641.'
    )).toBeInTheDocument();
    expect(screen.queryByText('Desktop sync failed.')).not.toBeInTheDocument();
  });

  it('shows the current sync stage above historical events', () => {
    renderActivity([{
      endpoint_url: 'http://10.0.2.2:38641',
      id: 'auto-started',
      message: 'Auto sync started.',
      occurred_at: '2026-05-07T23:12:00.000Z',
      status: 'started'
    }], {
      status: 'syncing',
      syncProgress: {
        completed: 12,
        completedBytes: 2_097_152,
        phase: 'content',
        total: 585,
        totalBytes: 10_066_330
      }
    });

    expect(screen.getByText('Current sync')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.getByText('Topic bodies; 12/585 - 2.0 MB/9.6 MB')).toBeInTheDocument();
    expect(screen.queryByText('Auto sync started.')).not.toBeInTheDocument();
  });

  it('shows an in-flight sync even before the first progress callback', () => {
    renderActivity([], { status: 'syncing' });

    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.getByText('Syncing; waiting for the next progress update.')).toBeInTheDocument();
    expect(screen.getByText('No completed sync activity yet.')).toBeInTheDocument();
  });
});
