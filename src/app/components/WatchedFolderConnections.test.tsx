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

vi.mock('../../shared/platform/external/useActiveSyncGroupMembership', () => ({
  useActiveSyncGroupMembership: activeGroup
}));

beforeEach(() => activeGroup.mockReturnValue(true));

function binding(id: string, overrides: Record<string, unknown> = {}) {
  return {
    action_mode: 'keep',
    archive_path: '',
    binding_id: id,
    connected_device_id: 'current-device',
    connected_device_name: 'This Mac',
    connected_platform: 'darwin',
    connection_status: 'connected',
    created_at: '2026-08-18T00:00:00.000Z',
    highlight_mode: 'merged',
    highlight_path: '',
    primary_path: `/source/${id}`,
    updated_at: '2026-08-18T00:00:00.000Z',
    ...overrides
  };
}

it('shows remote and waiting sources above the unchanged local settings', async () => {
  load.mockResolvedValue({
    bindings: [
      binding('local'),
      binding('remote', {
        connected_device_id: 'remote-device', connected_device_name: 'Office PC', connected_platform: 'win32'
      }),
      binding('waiting', {
        connected_device_id: null, connected_device_name: null, connected_platform: null, connection_status: 'needs-folder'
      })
    ],
    current_device_id: 'current-device'
  });

  renderWithLocalization(<WatchedFolderConnections />);

  const region = await screen.findByRole('region', { name: 'Other devices' });
  const remoteGroup = screen.getByRole('group', { name: 'Office PC' });
  const waitingGroup = screen.getByRole('group', { name: 'Waiting for a folder' });
  expect(within(region).getByText('Path')).toBeInTheDocument();
  expect(within(remoteGroup).getByText('Windows')).toBeInTheDocument();
  expect(within(remoteGroup).getByRole('button', { name: 'More actions for Office PC' })).toBeInTheDocument();
  expect(within(remoteGroup).getByRole('button', { name: 'More actions for /source/remote' })).toBeInTheDocument();
  expect(within(waitingGroup).getByRole('button', { name: 'More actions for /source/waiting' })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'This Mac' })).not.toBeInTheDocument();
});

it('does not add an empty workgroup block before local watched-folder settings', async () => {
  load.mockResolvedValue({ bindings: [], current_device_id: 'current-device' });

  renderWithLocalization(<WatchedFolderConnections />);

  expect(await screen.findByRole('region', { name: 'Other devices' }).catch(() => null)).toBeNull();
});
