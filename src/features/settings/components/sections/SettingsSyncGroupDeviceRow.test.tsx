import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { SyncGroupDevicePayload, SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { SettingsSyncGroupDeviceRow } from './SettingsSyncGroupDeviceRow';

const remote = device('remote', 'Windows PC');
const group: SyncGroupPayload = {
  created_at: '2026-09-15T00:00:00.000Z',
  devices: [device('local', 'Mac'), remote],
  display_name: 'Mac',
  group_id: 'group-1',
  local_device_identity_key: 'local'
};

it('offers removal for a remote Device', () => {
  const onRemove = vi.fn();
  renderWithLocalization(<SettingsSyncGroupDeviceRow device={remote} disabled={false} group={group}
    onRemove={onRemove} onTogglePause={vi.fn()} removing={false} syncEnabled syncPaused={false}
    topologyLabel={undefined} />);

  fireEvent.click(screen.getByRole('button', { name: 'Remove from Sync Group' }));

  expect(onRemove).toHaveBeenCalledWith(remote);
});

it('shows durable removal progress instead of a clickable action', () => {
  renderWithLocalization(<SettingsSyncGroupDeviceRow device={remote} disabled={false} group={group}
    onRemove={vi.fn()} onTogglePause={vi.fn()} removing syncEnabled syncPaused={false}
    topologyLabel={undefined} />);

  expect(screen.getByRole('button', { name: 'Removing…' })).toBeDisabled();
});

it('shows the local device as offline when Sync is off', () => {
  renderWithLocalization(<SettingsSyncGroupDeviceRow device={group.devices[0]!} disabled={false} group={group}
    onRemove={vi.fn()} onTogglePause={vi.fn()} removing={false} syncEnabled={false} syncPaused={false}
    topologyLabel="Finding sync anchor…" />);

  expect(screen.getByText('Sync off')).toBeVisible();
  expect(screen.queryByText('Finding sync anchor…')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pause Sync' })).not.toBeInTheDocument();
});

function device(id: string, name: string): SyncGroupDevicePayload {
  return {
    canonical_library_path: `/library/${id}`,
    contract_version: 1,
    device_anchor: id,
    device_identity_key: id,
    device_name: name,
    joined_at: '2026-09-15T00:00:00.000Z',
    last_seen_at: null,
    left_at: null,
    platform: id === 'local' ? 'darwin' : 'win32',
    state: 'active',
    updated_at: '2026-09-15T00:00:00.000Z'
  };
}
