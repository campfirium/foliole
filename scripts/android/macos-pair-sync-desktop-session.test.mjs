import { describe, expect, it, vi } from 'vitest';

import { ensureMacosSyncGroup } from './macos-pair-sync-desktop-session.mjs';

describe('macOS pair sync desktop session', () => {
  it('creates the Sync Group before fresh-device discovery', async () => {
    const actions = {
      create: vi.fn().mockResolvedValue({ sync_group: { group_id: 'group-1' } }),
      enable: vi.fn(),
      load: vi.fn().mockResolvedValue({ sync_group: null })
    };

    await expect(ensureMacosSyncGroup(actions)).resolves.toEqual({
      sync_group: { group_id: 'group-1' }
    });
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.enable).not.toHaveBeenCalled();
  });

  it('only enables sync when the Sync Group already exists', async () => {
    const actions = {
      create: vi.fn(),
      enable: vi.fn().mockResolvedValue({ sync_group: { group_id: 'group-1' } }),
      load: vi.fn().mockResolvedValue({ sync_group: { group_id: 'group-1' } })
    };

    await ensureMacosSyncGroup(actions);
    expect(actions.enable).toHaveBeenCalledOnce();
    expect(actions.create).not.toHaveBeenCalled();
  });
});
