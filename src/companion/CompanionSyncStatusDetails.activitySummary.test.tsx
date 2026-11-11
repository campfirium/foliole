import { screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncStatusDetails } from './CompanionSyncStatusDetails';

function renderActivity(events: ComponentProps<typeof CompanionSyncStatusDetails>['syncEvents'],
  page: ComponentProps<typeof CompanionSyncStatusDetails>['page'] = 'syncActivity') {
  renderWithLocalization(
    <CompanionSyncStatusDetails
      endpointUrl="http://10.0.2.2:38641"
      lastSyncedAt={null}
      onLeaveSyncGroup={vi.fn()}
      onOpenPage={vi.fn()}
      page={page}
      syncGroup={{ created_at: '', devices: [], display_name: 'Studio', group_id: 'group-1', local_device_identity_key: '' }}
      status="idle"
      syncConflictCount={0}
      syncEvents={events}
      syncProgress={null}
    />
  );
}

function localTimestamp(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function localDateGroupLabel(year: number, month: number, day: number) {
  return new Date(year, month - 1, day).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function summaryEvent(overrides: Partial<ComponentProps<typeof CompanionSyncStatusDetails>['syncEvents'][number]> = {}, withSummary = true) {
  return {
    endpoint_url: 'http://10.0.2.2:38641',
    id: 'summary-completed',
    kind: 'run_finished' as const,
    message: 'All stages completed.',
    occurred_at: localTimestamp(2026, 5, 9, 6, 42),
    result: 'completed' as const,
    run_id: 'summary-run',
    started_at: localTimestamp(2026, 5, 9, 6, 41),
    status: 'completed' as const,
    ...(withSummary ? { summary: { change_count: 5, duration_ms: 8_000 } } : {}),
    ...overrides
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 4, 9, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CompanionSyncStatusDetails activity summaries', () => {
  it('shows structured completed activity as a short 24-hour sync fact', () => {
    renderActivity([summaryEvent()]);

    expect(screen.getByText('06:42')).toBeInTheDocument();
    expect(screen.getByText('Synced 5 changes in 8s')).toBeInTheDocument();
    expect(screen.queryByText(/AM|PM/)).not.toBeInTheDocument();
  });

  it('shows no-change checks from structured activity summaries', () => {
    renderActivity([summaryEvent({
      id: 'summary-empty',
      summary: {
        change_count: 0,
        duration_ms: 2_000
      }
    })]);

    expect(screen.getByText('No changes, checked in 2s')).toBeInTheDocument();
  });

  it('uses date groups for older activity only', () => {
    renderActivity([
      summaryEvent(),
      summaryEvent({
        id: 'summary-yesterday',
        occurred_at: localTimestamp(2026, 5, 8, 14, 47),
        run_id: 'summary-run-yesterday'
      })
    ]);

    expect(screen.getByText('06:42')).toBeInTheDocument();
    expect(screen.getByText('14:47')).toBeInTheDocument();
    expect(screen.getByText(localDateGroupLabel(2026, 5, 8))).toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
  });

  it('shows waiting local-change summaries without splitting sync directions', () => {
    renderActivity([summaryEvent({
      id: 'summary-review',
      result: 'waiting',
      status: 'skipped',
      summary: {
        change_count: 2,
        desktop_review_count: 2,
        duration_ms: 8_000
      }
    })]);

    expect(screen.getByText('2 changes need desktop review')).toBeInTheDocument();
  });
});

describe('CompanionSyncStatusDetails WebDAV results', () => {
  it.each(['sync', 'syncActivity'] as const)('shows a completed WebDAV run as successful on %s', page => {
    renderActivity([summaryEvent({
      endpoint_url: null,
      message: 'WebDAV relay {"requests":{"PROPFIND":3,"GET":4,"PUT":2,"MOVE":2},"responses":11,' +
        '"uploadedBytes":3858,"downloadedBytes":10954,"published":2,"applied":0,"retries":0,"elapsedMs":10873}'
    }, false)], page);

    expect(screen.getByText(/All sync stages completed/)).toBeInTheDocument();
    expect(screen.queryByText(/Sync needs attention/)).not.toBeInTheDocument();
  });

  it('still reports a failed WebDAV run as an issue', () => {
    renderActivity([summaryEvent({
      endpoint_url: null,
      status: 'failed',
      result: 'failed',
      message: 'WebDAV relay {"requests":{"PROPFIND":1},"responses":1,"uploadedBytes":0,"downloadedBytes":17,' +
        '"published":0,"applied":0,"retries":0,"elapsedMs":1432,"errorCode":"webdav_relay_list_failed:530"}'
    }, false)], 'sync');

    expect(screen.getByText(/Open Activity for details/)).toBeInTheDocument();
    expect(screen.queryByText(/All sync stages completed/)).not.toBeInTheDocument();
  });
});
