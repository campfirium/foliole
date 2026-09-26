import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

const runtime = vi.hoisted(() => ({
  load: vi.fn(),
  notify: null as null | (() => void),
  save: vi.fn()
}));
vi.mock('../../shared/platform/runtime', () => ({ isDesktopRuntime: () => true }));
vi.mock('../../shared/platform/desktopSyncGroupRuntimeRepository', () => ({
  loadDesktopSyncGroupOverview: runtime.load,
  onDesktopSyncGroupOverviewChanged: (handler: () => void) => {
    runtime.notify = handler;
    return () => { runtime.notify = null; };
  },
  saveDesktopWatchedFolderConflict: runtime.save
}));

import { WatchedFolderConflictDialog } from './WatchedFolderConflictDialog';

const conflict = {
  conflict_key: '["/Shared/Articles",["local","remote"]]', path: '/Shared/Articles',
  sources: [
    { binding_id: 'local', host_name: 'Maci', host_platform: 'macOS',
      owner_device_identity_key: 'local-device' },
    { binding_id: 'remote', host_name: 'V', host_platform: 'win32',
      owner_device_identity_key: 'remote-device' }
  ]
};

beforeEach(() => {
  runtime.load.mockReset();
  runtime.save.mockReset();
  runtime.notify = null;
});

it('saves all selected devices once and closes when another device resolves the conflict', async () => {
  runtime.load.mockResolvedValueOnce({
    sync_group: { local_device_identity_key: 'local-device' },
    watched_folder_conflicts: [conflict]
  }).mockResolvedValue({ watched_folder_conflicts: [] });
  runtime.save.mockResolvedValue({ watched_folder_conflicts: [] });
  renderWithLocalization(<WatchedFolderConflictDialog />);

  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('/Shared/Articles');
  expect(dialog).toHaveTextContent('Maci');
  expect(dialog).toHaveTextContent('V');
  const save = screen.getByRole('button', { name: 'Save choices' });
  expect(save).toBeDisabled();
  const boxes = screen.getAllByRole('checkbox');
  fireEvent.click(boxes[0]!);
  fireEvent.click(boxes[1]!);
  fireEvent.click(save);
  await waitFor(() => expect(runtime.save).toHaveBeenCalledWith([{
    conflict_key: conflict.conflict_key, selected_binding_ids: ['local', 'remote']
  }]));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  runtime.load.mockResolvedValueOnce({ watched_folder_conflicts: [conflict] });
  runtime.notify?.();
  await screen.findByRole('dialog');
  runtime.notify?.();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
