import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WatchedFolderConnections } from './WatchedFolderConnections';

const { load } = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('../../shared/platform/import/watchedFolderRuntimeRepository', () => ({
  confirmWatchedFolderReconnectInRuntime: vi.fn(),
  disconnectWatchedFolderInRuntime: vi.fn(),
  loadWatchedFolderBindingsFromRuntime: load,
  previewWatchedFolderReconnectInRuntime: vi.fn(),
  removeWatchedFolderInRuntime: vi.fn()
}));

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

it('shows disconnect only for the local connected source and reconnect for a source waiting for a folder', async () => {
  load.mockResolvedValue({
    bindings: [
      binding('local'),
      binding('remote', { connected_device_id: 'remote-device', connected_device_name: 'Office PC' }),
      binding('waiting', { connection_status: 'needs-folder' })
    ],
    current_device_id: 'current-device'
  });

  renderWithLocalization(<WatchedFolderConnections />);

  expect(await screen.findByRole('heading', { name: 'Watched folders in this workgroup' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Disconnect' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Reconnect' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(3);
});
