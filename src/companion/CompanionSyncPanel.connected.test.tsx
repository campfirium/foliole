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

function completedEvent() {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    id: 'completed-event',
    message: 'Auto sync completed.',
    occurred_at: '2026-04-29T02:24:44.000Z',
    status: 'completed' as const
  };
}

function failedEvent() {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    id: 'failed-event',
    message: 'Desktop sync timed out while fetching content blobs.',
    occurred_at: '2026-04-29T02:18:33.000Z',
    status: 'failed' as const
  };
}

function backlogEvent() {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    id: 'backlog-event',
    message: 'Some topic bodies are still downloading.',
    occurred_at: '2026-04-29T02:24:44.000Z',
    status: 'skipped' as const
  };
}

function testShowsPairedState() {
  render(<CompanionSyncPanel {...createConnectedProps()} />);

  expect(screen.getByText('Last sync')).toBeInTheDocument();
  expect(screen.getByText('Handoff reminders')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Connect another device' })).not.toBeInTheDocument();
}

function testShowsPendingSyncConflicts() {
  render(<CompanionSyncPanel {...createConnectedProps()} syncConflictCount={2} />);

  expect(screen.getByText('Issues to resolve')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
}

function testSeparatesConnectionFromActivity() {
  const props = createConnectedProps();
  render(
    <CompanionSyncPanel
      {...props}
      lastSyncedAt="2026-04-29T02:24:44.000Z"
      pairingState={{ ...props.pairingState, device_name: 'Android Emulator' }}
      syncEvents={[completedEvent(), failedEvent()]}
    />
  );

  expect(screen.getByText('Last sync')).toBeInTheDocument();
  expect(screen.queryByText('Synced')).not.toBeInTheDocument();
  screen.getByRole('button', { name: /Activity/ }).click();
  expect(props.onOpenSettingsPage).toHaveBeenCalledWith('syncActivity');
}

function testManualPassIsNotAutomatic() {
  render(
    <CompanionSyncPanel
      {...createConnectedProps()}
      lastSyncedAt="2026-04-29T02:24:44.000Z"
      syncEvents={[{
        endpoint_url: 'http://10.0.2.2:38641',
        id: 'manual-completed-event',
        message: 'Sync fully completed.',
        occurred_at: '2026-04-29T02:24:44.000Z',
        status: 'completed'
      }]}
    />
  );

  expect(screen.getByText('All sync stages completed')).toBeInTheDocument();
  expect(screen.queryByText('Finished automatic pass')).not.toBeInTheDocument();
}

function testOlderFailuresAreNeutralAfterCompletedPass() {
  render(
    <CompanionSyncPanel
      {...createConnectedProps()}
      page="syncActivity"
      syncEvents={[completedEvent(), failedEvent()]}
    />
  );

  expect(screen.getByText('Earlier sync check finished')).toBeInTheDocument();
  const oldFailure = screen.getByText('Earlier sync attempt did not complete');
  expect(oldFailure).toBeInTheDocument();
  expect(oldFailure.className).not.toContain('text-error');
  expect(screen.getByText('Earlier sync check finished').className).not.toContain('text-companion-accent');
}

function testHealthyBacklogPassAvoidsStrictCompletion() {
  render(<CompanionSyncPanel {...createConnectedProps()} syncEvents={[backlogEvent()]} />);

  expect(screen.getByText('Last sync')).toBeInTheDocument();
  expect(screen.getByText('Some topic bodies are still downloading.')).toBeInTheDocument();
  expect(screen.queryByText('No finished sync yet')).not.toBeInTheDocument();
  expect(screen.queryByText('Finished automatic pass')).not.toBeInTheDocument();
}

function testOlderFailuresAreNeutralAfterBacklogPass() {
  render(
    <CompanionSyncPanel
      {...createConnectedProps()}
      page="syncActivity"
      syncEvents={[backlogEvent(), failedEvent()]}
    />
  );

  expect(screen.getByText('Some topic bodies are still downloading.')).toBeInTheDocument();
  const oldFailure = screen.getByText('Earlier sync attempt did not complete');
  expect(oldFailure).toBeInTheDocument();
  expect(oldFailure.className).not.toContain('text-error');
}

describe('CompanionSyncPanel connected state', () => {
  it('shows a paired state without setup controls', testShowsPairedState);
  it('shows pending sync conflicts when the local database has them', testShowsPendingSyncConflicts);
  it('separates the current connection state from older sync activity', testSeparatesConnectionFromActivity);
  it('does not call manual sync completion automatic', testManualPassIsNotAutomatic);
  it('shows older failures as neutral history after a later completed sync', testOlderFailuresAreNeutralAfterCompletedPass);
  it('shows a healthy backlog sync pass without claiming strict completion', testHealthyBacklogPassAvoidsStrictCompletion);
  it('shows older failures as neutral history after a later backlog sync pass', testOlderFailuresAreNeutralAfterBacklogPass);
});
