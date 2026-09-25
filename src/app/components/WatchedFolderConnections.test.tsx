import { screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WatchedFolderConnections } from './WatchedFolderConnections';

const { activeGroup, load } = vi.hoisted(() => ({ activeGroup: vi.fn(), load: vi.fn() }));

vi.mock('../../shared/platform/import/watchedFolderRuntimeRepository', () => ({
  confirmWatchedFolderReconnectInRuntime: vi.fn(),
  disconnectWatchedFolderInRuntime: vi.fn(),
  loadWatchedFolderBindingsFromRuntime: load,
  previewWatchedFolderReconnectInRuntime: vi.fn(),
  removeWatchedFolderInRuntime: vi.fn()
}));

vi.mock('../../shared/platform/external/useActiveSyncGroup', () => ({
  useActiveSyncGroup: activeGroup
}));

beforeEach(() => activeGroup.mockReturnValue(true));

function binding(id: string, overrides: Record<string, unknown> = {}) {
  return {
    action_mode: 'keep',
    archive_path: '',
    binding_id: id,
    host_name: 'This Mac',
    host_platform: 'darwin',
    owner_device_identity_key: 'local-device',
    connection_status: 'connected',
    created_at: '2026-08-18T00:00:00.000Z',
    highlight_mode: 'merged',
    highlight_path: '',
    primary_path: `/source/${id}`,
    source_ref: `watched:${id}`,
    updated_at: '2026-08-18T00:00:00.000Z',
    ...overrides
  };
}

it('shows other devices and unassigned sources, but not this device, above local settings', async () => {
  load.mockResolvedValue({
    bindings: [
      binding('local'),
      binding('remote', {
        host_name: 'Office PC', host_platform: 'win32', owner_device_identity_key: 'remote-device',
        primary_path: 'D:\\Notes\\Articles'
      }),
      binding('waiting', {
        host_name: '', host_platform: '', connection_status: 'needs-folder',
        owner_device_identity_key: null, primary_path: ''
      }),
      binding('replaced', {
        connection_status: 'needs-folder'
      })
    ],
    current_host_name: 'This Mac', current_device_identity_key: 'local-device'
  });

  renderWithLocalization(<WatchedFolderConnections />);

  const region = await screen.findByRole('region', { name: 'Watched folders in this workgroup' });
  const remoteGroup = screen.getByRole('group', { name: 'Office PC' });
  const waitingGroup = screen.getByRole('group', { name: 'Waiting for a folder' });
  expect(within(region).getByText('Path')).toBeInTheDocument();
  expect(within(remoteGroup).getByText('Windows')).toBeInTheDocument();
  expect(within(remoteGroup).getByText('D:\\Notes\\Articles')).toBeInTheDocument();
  expect(within(remoteGroup).getByRole('button', { name: 'More actions for D:\\Notes\\Articles' })).toBeInTheDocument();
  expect(within(waitingGroup).getByRole('button', { name: 'More actions for Watched folder' })).toBeInTheDocument();
  expect(within(region).queryByRole('group', { name: 'This Mac' })).not.toBeInTheDocument();
});

it('does not add an empty workgroup block before local watched-folder settings', async () => {
  load.mockResolvedValue({
    bindings: [binding('local-needs-folder', { connection_status: 'needs-folder' })],
    current_host_name: 'This Mac', current_device_identity_key: 'local-device'
  });

  renderWithLocalization(<WatchedFolderConnections />);

  expect(await screen.findByRole('region', { name: 'Watched folders in this workgroup' }).catch(() => null)).toBeNull();
});
