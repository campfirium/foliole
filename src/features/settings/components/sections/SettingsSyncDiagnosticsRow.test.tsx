import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { DesktopSyncActivityEvent, DesktopSyncDiagnosticsPayload } from '../../../../../lib/platform/desktopSyncDiagnosticsContract';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { EMPTY_DESKTOP_SYNC_GROUP_OVERVIEW } from '../../../../shared/platform/desktopSyncGroupOverviewHooks';

import { DesktopSyncActivityList } from './DesktopSyncActivityList';
import { SettingsSyncDiagnosticsRow } from './SettingsSyncDiagnosticsRow';

const load = vi.hoisted(() => vi.fn());
vi.mock('../../../../shared/platform/desktop/desktopSyncDiagnosticsRuntime', () => ({ loadDesktopSyncDiagnostics: load }));

function event(values: Partial<DesktopSyncActivityEvent>): DesktopSyncActivityEvent {
  return { id: 'event', run_id: 'round', endpoint_url: null, occurred_at: '2026-10-02T00:00:00Z',
    direction: 'receive', kind: 'stage_finished', message: 'Saved', stage: 'sync_pack', status: 'completed',
    confirmation: 'saved', peer_device_id: 'a', peer_device_name: 'Desktop A', ...values };
}

beforeEach(() => { load.mockReset(); });

it('groups changing peers and both directions within the same round without treating sent data as confirmed', () => {
  renderWithLocalization(<DesktopSyncActivityList activeIds={[]} events={[
    event({ id: 'sent', peer_device_id: 'b', peer_device_name: 'Desktop B', direction: 'send',
      kind: 'run_finished', status: 'skipped', result: 'waiting', confirmation: 'sent' }),
    event({ id: 'received' })
  ]} />);
  expect(screen.getAllByRole('button', { name: 'Details' })).toHaveLength(1);
  expect(screen.getByText(/Waiting for confirmation/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Details' }));
  expect(screen.getByText(/Receive · Desktop A/)).toBeInTheDocument();
  expect(screen.getByText(/Send · Desktop B/)).toHaveTextContent('waiting for version saving confirmation');
  expect(screen.queryByText(/confirmed saving/)).not.toBeInTheDocument();
});

it('does not mark an unfinished historical round as running when another round is active', () => {
  renderWithLocalization(<DesktopSyncActivityList activeIds={['current']} events={[
    event({ id: 'new', run_id: 'current', kind: 'run_started', status: 'started' }),
    event({ id: 'old', run_id: 'old', kind: 'run_started', status: 'started' })
  ]} />);
  expect(screen.getByText(/In progress/)).toBeInTheDocument();
  expect(screen.getByText(/No completion recorded/)).toBeInTheDocument();
});

function result(): DesktopSyncDiagnosticsPayload {
  return {
    active_run: false, active_run_ids: [], activity: [], overview: EMPTY_DESKTOP_SYNC_GROUP_OVERVIEW,
    report_text: 'redacted report', snapshot: { collected_at: '2026-10-02T00:00:00Z', verdicts: [] } as never
  };
}

it('loads on opening, refreshes the snapshot and copies the supplied report without starting sync', async () => {
  load.mockResolvedValue(result());
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  renderWithLocalization(<SettingsSyncDiagnosticsRow disabled={false} />);
  expect(load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'View log' }));
  await screen.findByText('No sync activity recorded yet');
  fireEvent.click(screen.getByRole('button', { name: 'Copy log summary' }));
  await waitFor(() => expect(copy).toHaveBeenCalledWith('redacted report'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('shows diagnostic load failures and permits a later refresh', async () => {
  load.mockRejectedValueOnce(new Error('diagnostic unavailable')).mockResolvedValueOnce(result());
  renderWithLocalization(<SettingsSyncDiagnosticsRow disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'View log' }));
  await screen.findByText('diagnostic unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText('No sync activity recorded yet');
  expect(screen.queryByText('diagnostic unavailable')).not.toBeInTheDocument();
});
