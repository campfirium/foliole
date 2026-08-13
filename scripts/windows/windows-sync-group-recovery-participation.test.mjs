import { expect, it, vi } from 'vitest';

import { enableWindowsSyncParticipation } from './windows-sync-group-participation-control.mjs';

it('turns on fresh Windows Sync before discovering a group', async () => {
  const invoke = vi.fn(async () => ({
    participating: true, sync_enabled: true, sync_paused: false
  }));

  await expect(enableWindowsSyncParticipation({}, invoke)).resolves.toMatchObject({
    participating: true, sync_enabled: true, sync_paused: false
  });
  expect(invoke).toHaveBeenCalledWith({}, 'enable_companion_sync');
});

it('rejects a Windows join baseline that remains inactive', async () => {
  const invoke = vi.fn(async () => ({
    participating: false, sync_enabled: true, sync_paused: true
  }));

  await expect(enableWindowsSyncParticipation({}, invoke)).rejects.toThrow('did not turn on');
});
