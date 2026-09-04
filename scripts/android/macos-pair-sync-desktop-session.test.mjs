/* global AbortController, process */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  ensureMacosSyncGroup,
  openMacosPairSyncDesktopSession,
  resolveFrozenRendererUrl,
  sanitizeMacosPairSyncOverview,
  waitForMacosPairRequest
} from './macos-pair-sync-desktop-session.mjs';

const repoRoot = path.join(path.parse(process.cwd()).root, 'repo', 'foliole');
const rendererPath = path.join(repoRoot, 'dist', 'desktop', 'index.html');
const rendererUrl = pathToFileURL(rendererPath).toString();

describe('macOS pair sync desktop session', () => {
  it('preserves the bounded listener failure while redacting authorization ids', () => {
    const overview = {
      paired_authorizations: [{ authorization_id: 'peer-authorization' }],
      pending_requests: [],
      server_status: {
        last_error: ` listen EADDRINUSE ${'x'.repeat(600)} `,
        state: 'failed'
      },
      sync_enabled: true,
      sync_group: {
        local_host_name: 'Mac',
        members: [{
          authorization_id: 'local-authorization', host_name: 'Mac', state: 'active'
        }]
      }
    };

    expect(sanitizeMacosPairSyncOverview(overview)).toMatchObject({
      pairedAuthorizationFingerprints: [expect.stringMatching(/^[a-f0-9]{16}$/u)],
      serverLastError: expect.stringMatching(/^listen EADDRINUSE/u),
      serverState: 'failed'
    });
    expect(sanitizeMacosPairSyncOverview(overview).serverLastError).toHaveLength(512);
    expect(JSON.stringify(sanitizeMacosPairSyncOverview(overview)))
      .not.toContain('local-authorization');
  });

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
      url: vi.fn(() => rendererUrl),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForURL: vi.fn().mockResolvedValue(undefined)
    };
    const launch = vi.fn().mockResolvedValue({
      close, firstWindow: vi.fn().mockResolvedValue(page), process: () => ({ pid: 42 })
    });
    const runtimeRoot = path.join(path.parse(process.cwd()).root, 'controller', 'runtime');
    const prepareHiddenRuntime = vi.fn(() => ({
      cleanup,
      executablePath: path.join(
        path.parse(process.cwd()).root, 'tmp', 'BackgroundElectron.app', 'Contents', 'MacOS',
        'Electron'
      ),
      runtimeFingerprint: 'a'.repeat(64),
      runtimeIdentity: 'stable-source-bound'
    }));

    const session = await openMacosPairSyncDesktopSession({
      acquireCredentialSession: vi.fn(() => releaseCredentialSession),
      electronLauncher: { launch },
      env: {
        ELECTRON_RENDERER_URL: 'http://127.0.0.1:24600/',
        FOLIOLE_SHARED_CACHE_ROOT: '/shared-cache',
        FOLIOLE_VITE_HMR: '0'
      },
      libraryHome: path.join(path.parse(process.cwd()).root, 'tmp', 'library'),
      logEvent: (event) => timeline.push(event),
      operationId: 'pair-sync-1',
      prepareHiddenRuntime,
      rendererExists: () => true,
      repoRoot, runtimeRoot
    });

    expect(prepareHiddenRuntime).toHaveBeenCalledWith({
      appRoot: repoRoot, cacheRoot: '/shared-cache',
      env: expect.objectContaining({ FOLIOLE_VITE_HMR: '0' })
    });

    expect(launch).toHaveBeenCalledWith(expect.objectContaining({
      env: expect.objectContaining({
        ELECTRON_RENDERER_URL: rendererUrl,
        FOLIOLE_HIDDEN_CREDENTIAL_APP_NAME: `Foliole Hidden Native ${'a'.repeat(20)}`,
        FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH: path.join(repoRoot, 'dist', 'electron', 'main.js'),
        FOLIOLE_SKIP_STARTUP_WINDOW_STATE: '1',
        FOLIOLE_USER_DATA_PATH: path.join(
          runtimeRoot, 'credential-sessions',
          `runtime-${'a'.repeat(20)}`, 'user-data'
        ),
        FOLIOLE_VITE_HMR: '1'
      }),
      args: [path.join(
        repoRoot, 'scripts', 'desktop', 'macos-hidden-electron-credential-bootstrap.mjs'
      )],
      executablePath: path.join(
        path.parse(process.cwd()).root, 'tmp', 'BackgroundElectron.app', 'Contents', 'MacOS',
        'Electron'
      )
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
        payload: { url: rendererUrl }
      }),
      expect.objectContaining({ event: 'session_ready' }),
      expect.objectContaining({ event: 'session_closed' })
    ]);
  });

  it('fails closed when the frozen renderer is unavailable', () => {
    expect(() => resolveFrozenRendererUrl(repoRoot, () => false)).toThrow(
      `Frozen desktop renderer is missing: ${rendererPath}`
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
      repoRoot
    })).rejects.toThrow('macos_hidden_electron_keychain_identity_unverified');

    expect(launch).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('rejects every caller-provided pairing store path before preparing Electron', async () => {
    const prepareHiddenRuntime = vi.fn();

    await expect(openMacosPairSyncDesktopSession({
      prepareHiddenRuntime,
      rendererExists: () => true,
      repoRoot,
      userDataPath: '/Users/example/Library/Application Support/Foliole'
    })).rejects.toThrow('macos_hidden_electron_user_data_override_forbidden');
    expect(prepareHiddenRuntime).not.toHaveBeenCalled();
  });

  it('observes a fixed request after the legacy window but before the shared deadline', async () => {
    const request = { host_name: 'A5', pair_request_id: 'pair-1' };
    let currentTime = 0;
    const session = { load: vi.fn()
      .mockResolvedValueOnce({ pending_requests: [] })
      .mockResolvedValueOnce({ pending_requests: [] })
      .mockResolvedValue({ pending_requests: [request] }) };
    const wait = vi.fn(async () => { currentTime += 25_000; });

    await expect(waitForMacosPairRequest(session, request.host_name, {
      deadline: 90_000, now: () => currentTime, wait
    })).resolves.toBe(request);
    expect(currentTime).toBe(50_000);
  });

  it('stops request observation at the shared cancellation boundary', async () => {
    const controller = new AbortController();
    const session = { load: vi.fn(async () => ({ pending_requests: [] })) };
    const wait = vi.fn(async () => { controller.abort(); });

    await expect(waitForMacosPairRequest(session, 'A5', {
      deadline: 180_000, now: () => 0, signal: controller.signal, wait
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(session.load).toHaveBeenCalledOnce();
  });
});
