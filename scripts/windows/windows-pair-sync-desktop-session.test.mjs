// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  openPairSyncDesktopSession, pairSyncIdentityFingerprint, waitForUniquePairRequest
} from './windows-pair-sync-desktop-session.mjs';

function launcherFixture(libraryHome = 'D:\\X\\U\\Foliole') {
  const calls = [];
  const page = {
    evaluate: vi.fn(async (_callback, input) => {
      calls.push(input);
      if (input.commandName === 'load_library_path_settings') return { library_home: libraryHome };
      return {
        paired_devices: [], pending_requests: [],
        primary_device_state: { local_role: 'primary', primary_device_id: 'desktop-device-1' },
        server_status: { state: 'running' }, sync_enabled: true
      };
    }),
    waitForFunction: vi.fn(async () => undefined)
  };
  const app = { close: vi.fn(async () => undefined), firstWindow: vi.fn(async () => page) };
  return { app, calls, launcher: { launch: vi.fn(async () => app) }, page };
}

it('launches the real current-library runtime and invokes only existing product commands', async () => {
  const fixture = launcherFixture();
  const session = await openPairSyncDesktopSession({
    electronLauncher: fixture.launcher, env: {}, repoRoot: 'C:\\dev\\foliole-android-lab-preview'
  });
  await session.enable();
  await session.approve('pair-1');
  const launchEnv = fixture.launcher.launch.mock.calls[0][0].env;
  expect(launchEnv.FOLIOLE_LIBRARY_HOME).toBe('D:\\X\\U\\Foliole');
  expect(launchEnv).not.toHaveProperty('FOLIOLE_USER_DATA_PATH');
  expect(launchEnv).not.toHaveProperty('FOLIOLE_SESSION_DATA_PATH');
  expect(fixture.calls.map((call) => call.commandName)).toEqual([
    'load_library_path_settings', 'enable_companion_sync', 'approve_companion_pair_request'
  ]);
  expect(fixture.calls.at(-1).commandArgs).toEqual({ pair_request_id: 'pair-1' });
  expect(session.sanitize(await session.load()).desktopPeerFingerprint)
    .toBe(pairSyncIdentityFingerprint('desktop-device-1'));
});

it('rejects another library and closes the bounded runtime', async () => {
  const fixture = launcherFixture('D:\\Other');
  await expect(openPairSyncDesktopSession({
    electronLauncher: fixture.launcher, env: {}, repoRoot: 'C:\\dev\\foliole-android-lab-preview'
  })).rejects.toThrow('fixed current library');
  expect(fixture.app.close).toHaveBeenCalledOnce();
});

it('classifies bounded current-library readiness failures', async () => {
  const fixture = launcherFixture();
  fixture.page.waitForFunction.mockRejectedValue(Object.freeze(new Error('page closed')));
  fixture.app.close.mockRejectedValue(new Error('close failed'));
  await expect(openPairSyncDesktopSession({
    electronLauncher: fixture.launcher, env: {}, repoRoot: 'C:\\dev\\foliole-android-lab-preview'
  })).rejects.toMatchObject({ exitCode: 74, stage: 'desktop-runtime-ready' });
  expect(fixture.app.close).toHaveBeenCalledOnce();
});

it('approves only one request from the expected device fingerprint', async () => {
  const request = { device_id: 'android-device-1', pair_request_id: 'pair-1' };
  const session = { load: vi.fn(async () => ({ pending_requests: [request] })) };
  await expect(waitForUniquePairRequest(
    session, pairSyncIdentityFingerprint(request.device_id), { wait: vi.fn() }
  )).resolves.toBe(request);
  await expect(waitForUniquePairRequest(
    session, pairSyncIdentityFingerprint('other'), { wait: vi.fn() }
  )).rejects.toThrow('another device');
});
