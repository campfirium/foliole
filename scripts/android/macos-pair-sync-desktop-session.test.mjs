import { describe, expect, it, vi } from 'vitest';

import {
  ensureMacosSyncGroup,
  openMacosPairSyncDesktopSession
} from './macos-pair-sync-desktop-session.mjs';

describe('macOS pair sync desktop session', () => {
  it('creates the Sync Group before fresh-device discovery', async () => {
    const actions = {
      create: vi.fn().mockResolvedValue({ sync_group: { group_id: 'group-1' } }),
      enable: vi.fn(),
      load: vi.fn().mockResolvedValue({ sync_group: null }),
      resume: vi.fn()
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
      load: vi.fn().mockResolvedValue({ sync_group: { group_id: 'group-1' } }),
      resume: vi.fn()
    };

    await ensureMacosSyncGroup(actions);
    expect(actions.enable).toHaveBeenCalledOnce();
    expect(actions.create).not.toHaveBeenCalled();
  });

  it('resumes an existing paused Sync Group through the product command', async () => {
    const actions = {
      create: vi.fn(), enable: vi.fn(),
      load: vi.fn().mockResolvedValue({ sync_group: { group_id: 'group-1' }, sync_paused: true }),
      resume: vi.fn().mockResolvedValue({ sync_group: { group_id: 'group-1' }, sync_paused: false })
    };

    await ensureMacosSyncGroup(actions);
    expect(actions.resume).toHaveBeenCalledOnce();
    expect(actions.enable).not.toHaveBeenCalled();
  });

  it('launches multi-device desktop work through the prepared background runtime', async () => {
    const cleanup = vi.fn();
    const close = vi.fn().mockResolvedValue(undefined);
    const timeline = [];
    const page = { waitForFunction: vi.fn().mockResolvedValue(undefined) };
    const launch = vi.fn().mockResolvedValue({
      close, firstWindow: vi.fn().mockResolvedValue(page), process: () => ({ pid: 42 })
    });

    const session = await openMacosPairSyncDesktopSession({
      electronLauncher: { launch },
      libraryHome: '/tmp/library',
      logEvent: (event) => timeline.push(event),
      operationId: 'pair-sync-1',
      prepareHiddenRuntime: vi.fn(() => ({
        cleanup,
        executablePath: '/tmp/BackgroundElectron.app/Contents/MacOS/Electron'
      })),
      repoRoot: '/repo/foliole',
      userDataPath: '/tmp/user-data'
    });

    expect(launch).toHaveBeenCalledWith(expect.objectContaining({
      executablePath: '/tmp/BackgroundElectron.app/Contents/MacOS/Electron'
    }));
    await session.close();
    expect(close).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(timeline).toEqual([
      expect.objectContaining({ event: 'session_started', operationId: 'pair-sync-1' }),
      expect.objectContaining({ event: 'electron_started', payload: { pid: 42 } }),
      expect.objectContaining({ event: 'session_ready' }),
      expect.objectContaining({ event: 'session_closed' })
    ]);
  });
});
