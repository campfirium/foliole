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
    const releaseCredentialSession = vi.fn();
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
      acquireCredentialSession: vi.fn(() => releaseCredentialSession),
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
        executablePath: '/tmp/BackgroundElectron.app/Contents/MacOS/Electron',
        runtimeFingerprint: 'a'.repeat(64),
        runtimeIdentity: 'stable-source-bound'
      })),
      rendererExists: () => true,
      repoRoot: '/repo/foliole'
    });

    expect(launch).toHaveBeenCalledWith(expect.objectContaining({
      env: expect.objectContaining({
        ELECTRON_RENDERER_URL: 'file:///repo/foliole/dist/desktop/index.html',
        FOLIOLE_HIDDEN_CREDENTIAL_APP_NAME: `Foliole Hidden Native ${'a'.repeat(20)}`,
        FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH: '/repo/foliole/dist/electron/main.js',
        FOLIOLE_USER_DATA_PATH:
          `/repo/foliole/.tmp/native-hidden-electron/credential-sessions/runtime-${'a'.repeat(20)}/user-data`,
        FOLIOLE_VITE_HMR: '1'
      }),
      args: ['/repo/foliole/scripts/desktop/macos-hidden-electron-credential-bootstrap.mjs'],
      executablePath: '/tmp/BackgroundElectron.app/Contents/MacOS/Electron'
    }));
    await session.close();
    expect(close).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(releaseCredentialSession).toHaveBeenCalledOnce();
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

  it('does not launch Electron from an ephemeral credential runtime', async () => {
    const cleanup = vi.fn();
    const launch = vi.fn();

    await expect(openMacosPairSyncDesktopSession({
      electronLauncher: { launch },
      logEvent: vi.fn(),
      prepareHiddenRuntime: vi.fn(() => ({
        cleanup,
        executablePath: '/tmp/BackgroundElectron.app/Contents/MacOS/Electron',
        runtimeIdentity: 'ephemeral'
      })),
      rendererExists: () => true,
      repoRoot: '/repo/foliole'
    })).rejects.toThrow('macos_hidden_electron_keychain_identity_unverified');

    expect(launch).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('rejects every caller-provided pairing store path before preparing Electron', async () => {
    const prepareHiddenRuntime = vi.fn();

    await expect(openMacosPairSyncDesktopSession({
      prepareHiddenRuntime,
      rendererExists: () => true,
      repoRoot: '/repo/foliole',
      userDataPath: '/Users/example/Library/Application Support/Foliole'
    })).rejects.toThrow('macos_hidden_electron_user_data_override_forbidden');
    expect(prepareHiddenRuntime).not.toHaveBeenCalled();
  });
});
