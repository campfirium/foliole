import { describe, expect, it, vi } from 'vitest';

import {
  ensureMacosSyncGroup,
  openMacosPairSyncDesktopSession,
  resolveFrozenRendererUrl
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
    const page = {
      url: vi.fn(() => 'file:///repo/foliole/dist/desktop/index.html'),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForURL: vi.fn().mockResolvedValue(undefined)
    };
    const launch = vi.fn().mockResolvedValue({
      close, firstWindow: vi.fn().mockResolvedValue(page), process: () => ({ pid: 42 })
    });

    const session = await openMacosPairSyncDesktopSession({
      electronLauncher: { launch },
      env: {
        ELECTRON_RENDERER_URL: 'http://127.0.0.1:24600/',
        FOLIOLE_VITE_HMR: '0'
      },
      libraryHome: '/tmp/library',
      logEvent: (event) => timeline.push(event),
      operationId: 'pair-sync-1',
      prepareHiddenRuntime: vi.fn(() => ({
        cleanup,
        executablePath: '/tmp/BackgroundElectron.app/Contents/MacOS/Electron'
      })),
      rendererExists: () => true,
      repoRoot: '/repo/foliole',
      userDataPath: '/tmp/user-data'
    });

    expect(launch).toHaveBeenCalledWith(expect.objectContaining({
      env: expect.objectContaining({
        ELECTRON_RENDERER_URL: 'file:///repo/foliole/dist/desktop/index.html',
        FOLIOLE_VITE_HMR: '1'
      }),
      executablePath: '/tmp/BackgroundElectron.app/Contents/MacOS/Electron'
    }));
    await session.close();
    expect(close).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(timeline).toEqual([
      expect.objectContaining({ event: 'session_started', operationId: 'pair-sync-1' }),
      expect.objectContaining({ event: 'electron_started', payload: { pid: 42 } }),
      expect.objectContaining({
        event: 'renderer_loaded',
        payload: { url: 'file:///repo/foliole/dist/desktop/index.html' }
      }),
      expect.objectContaining({ event: 'session_ready' }),
      expect.objectContaining({ event: 'session_closed' })
    ]);
  });

  it('fails closed when the frozen renderer is unavailable', () => {
    expect(() => resolveFrozenRendererUrl('/repo/foliole', () => false)).toThrow(
      'Frozen desktop renderer is missing: /repo/foliole/dist/desktop/index.html'
    );
  });
});
