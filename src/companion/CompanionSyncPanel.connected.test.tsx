import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CompanionSyncPanel } from './CompanionSyncPanel';
import { backlogEvent, completedEvent, createConnectedProps, failedEvent } from './CompanionSyncPanel.connected.testSupport';

function testShowsPairedState() {
  render(<CompanionSyncPanel {...createConnectedProps()} />);

  expect(screen.getByText('Last sync')).toBeInTheDocument();
  expect(screen.getByText('Handoff reminders')).toBeInTheDocument();
  expect(screen.queryByText('Topics on this device')).not.toBeInTheDocument();
  expect(screen.queryByText('Sync check')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Connect another device' })).not.toBeInTheDocument();
}

function testShowsPendingSyncConflicts() {
  render(<CompanionSyncPanel {...createConnectedProps()} syncConflictCount={2} />);

  expect(screen.getByText('Issues to resolve')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
}

function testHidesRetiredPrimaryDeviceControls() {
  render(
    <CompanionSyncPanel
      {...createConnectedProps()}
      pairingState={{
        ...createConnectedProps().pairingState,
        primary_device_id: 'device-33ea4460-7c28-44c1-82f6-35ea045d260e'
      }}
      status="syncing"
    />
  );

  expect(screen.queryByText('Device role')).not.toBeInTheDocument();
  expect(screen.queryByText('device-33ea...260e')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Set as primary device' })).not.toBeInTheDocument();
  expect(screen.getByTestId('companion-sync-connection'))
    .toHaveTextContent('Foliole Desktop on Windows (Windows)');
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
  expect(screen.getByText('Failed')).toBeInTheDocument();
  expect(screen.getByText('Sync needs attention. Open Activity for details.')).toBeInTheDocument();
  expect(screen.queryByText('Desktop sync timed out while fetching content blobs.')).not.toBeInTheDocument();
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

  expect(screen.getByText('No sync yet')).toBeInTheDocument();
  expect(screen.queryByText('No changes to sync.')).not.toBeInTheDocument();
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

  const currentFailure = screen.getByText('Desktop sync timed out while fetching content blobs.');
  expect(currentFailure).toBeInTheDocument();
  expect(screen.queryByText('No changes to sync.')).not.toBeInTheDocument();
}

function testActivityPageDoesNotShowSyncActions() {
  render(<CompanionSyncPanel {...createConnectedProps()} page="syncActivity" />);

  expect(screen.getByText('Completed')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sync' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Set as primary device' })).not.toBeInTheDocument();
}

function testHealthyBacklogPassAvoidsStrictCompletion() {
  render(<CompanionSyncPanel {...createConnectedProps()} syncEvents={[backlogEvent()]} />);

  expect(screen.getByText('Last sync')).toBeInTheDocument();
  expect(screen.getByText('Some topic bodies are still downloading.')).toBeInTheDocument();
  expect(screen.queryByText('No sync check yet')).not.toBeInTheDocument();
  expect(screen.queryByText('Finished automatic pass')).not.toBeInTheDocument();
}

function testHidesDiagnosticSkippedDetailsFromSummary() {
  const diagnosticMessage = [
    'Android changes were not sent: Failed to load companion sync node versions.',
    'no such function: json_extract (code 1 SQLITE_ERROR); while compiling: SELECT v.version_id FROM node_sync_versions.'
  ].join(' ');
  render(
    <CompanionSyncPanel
      {...createConnectedProps()}
      syncEvents={[{
        endpoint_url: 'http://10.0.2.2:38641',
        id: 'diagnostic-skipped-event',
        message: diagnosticMessage,
        occurred_at: '2026-05-29T05:22:00.000Z',
        status: 'skipped'
      }]}
    />
  );

  expect(screen.getByText('Sync needs attention. Open Activity for details.')).toBeInTheDocument();
  expect(screen.queryByText(/json_extract/)).not.toBeInTheDocument();
}

function testHidesDiagnosticCompletedDetailsFromSummary() {
  render(
    <CompanionSyncPanel
      {...createConnectedProps()}
      syncEvents={[{
        endpoint_url: 'http://10.0.2.2:38641',
        id: 'diagnostic-completed-event',
        message: 'Android changes were not sent: Failed to load versions; while compiling: SELECT json_extract(snapshot_json).',
        occurred_at: '2026-05-29T05:22:00.000Z',
        status: 'completed'
      }]}
    />
  );

  expect(screen.getByText('Sync needs attention. Open Activity for details.')).toBeInTheDocument();
  expect(screen.queryByText(/json_extract/)).not.toBeInTheDocument();
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
  const oldFailure = screen.getByText('Earlier issue: Desktop sync timed out while fetching content blobs.');
  expect(oldFailure).toBeInTheDocument();
  expect(oldFailure.className).not.toContain('text-error');
}

function testCurrentFailureShowsCause() {
  render(
    <CompanionSyncPanel
      {...createConnectedProps()}
      page="syncActivity"
      syncEvents={[failedEvent()]}
    />
  );

  expect(screen.getByText('Desktop sync timed out while fetching content blobs.')).toBeInTheDocument();
  expect(screen.queryByText('Sync did not complete')).not.toBeInTheDocument();
}

function testHidesCheckOnlyCompletionWithoutTiming() {
  render(
    <CompanionSyncPanel
      {...createConnectedProps()}
      lastSyncedAt="2026-05-02T11:09:00.000Z"
      syncEvents={[{
        endpoint_url: 'http://10.0.2.2:38641',
        id: 'check-only-event',
        message: 'Sync fully completed; timing: topic list 1s, topic bodies 0.1s, attachment files 0.1s',
        occurred_at: '2026-05-02T11:09:00.000Z',
        status: 'completed'
      }]}
    />
  );

  expect(screen.getByText('Last sync')).toBeInTheDocument();
  expect(screen.getByText('No sync yet')).toBeInTheDocument();
  expect(screen.queryByText(/Timing:/)).not.toBeInTheDocument();
  expect(screen.queryByText('Last check')).not.toBeInTheDocument();
  expect(screen.getByText('No activity')).toBeInTheDocument();
}

function testShowsTransferProgressInLastSyncRow() {
  render(
    <CompanionSyncPanel
      {...createConnectedProps()}
      syncProgress={{
        attachmentBreakdown: {
          activeTopicAttachments: 0,
          imageAttachments: 21,
          otherAttachments: 0,
          pdfAttachments: 1
        },
        completed: 0,
        completedBytes: 0,
        phase: 'attachment',
        total: 22,
        totalBytes: 34288435
      }}
    />
  );

  expect(screen.queryByText('Last sync')).not.toBeInTheDocument();
  expect(screen.getByText('Attachments')).toBeInTheDocument();
  expect(screen.getByText('0/22 - 0 B/32.7 MB')).toBeInTheDocument();
  expect(screen.getByText('Images 21 · PDFs 1 · Other 0')).toBeInTheDocument();
}

describe('CompanionSyncPanel connected state', () => {
  it('shows a paired state without setup controls', testShowsPairedState);
  it('shows pending sync conflicts when the local database has them', testShowsPendingSyncConflicts);
  it('hides retired primary-device controls while keeping the paired device readable', testHidesRetiredPrimaryDeviceControls);
  it('separates the current connection state from older sync activity', testSeparatesConnectionFromActivity);
  it('does not call manual sync completion automatic', testManualPassIsNotAutomatic);
  it('shows older failures as neutral history after a later completed sync', testOlderFailuresAreNeutralAfterCompletedPass);
  it('does not show sync actions on the activity page', testActivityPageDoesNotShowSyncActions);
  it('shows a healthy backlog sync pass without claiming strict completion', testHealthyBacklogPassAvoidsStrictCompletion);
  it('hides diagnostic skipped details from the connected summary', testHidesDiagnosticSkippedDetailsFromSummary);
  it('hides diagnostic completed details from the connected summary', testHidesDiagnosticCompletedDetailsFromSummary);
  it('shows older failures as neutral history after a later backlog sync pass', testOlderFailuresAreNeutralAfterBacklogPass);
  it('shows the current failure cause in activity', testCurrentFailureShowsCause);
  it('hides check-only completed passes from user-facing sync status', testHidesCheckOnlyCompletionWithoutTiming);
  it('replaces the Last sync row with transfer progress while syncing resources', testShowsTransferProgressInLastSyncRow);
});
