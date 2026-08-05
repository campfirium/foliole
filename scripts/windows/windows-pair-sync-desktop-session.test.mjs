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
  await session.remove('old-device');
  const launchEnv = fixture.launcher.launch.mock.calls[0][0].env;
  expect(launchEnv.FOLIOLE_LIBRARY_HOME).toBe('D:\\X\\U\\Foliole');
  expect(launchEnv).not.toHaveProperty('FOLIOLE_USER_DATA_PATH');
  expect(launchEnv).not.toHaveProperty('FOLIOLE_SESSION_DATA_PATH');
  expect(fixture.calls.map((call) => call.commandName)).toEqual([
    'load_library_path_settings', 'enable_companion_sync', 'approve_companion_pair_request',
    'remove_companion_paired_device'
  ]);
  expect(fixture.calls.at(-1).commandArgs).toEqual({ device_id: 'old-device' });
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

it('retries only the bounded Chromium profile lock collision', async () => {
  const fixture = launcherFixture();
  fixture.launcher.launch
    .mockRejectedValueOnce(new Error('Lock file can not be created! Error code: 32'))
    .mockResolvedValueOnce(fixture.app);
  const wait = vi.fn(async () => undefined);
  const session = await openPairSyncDesktopSession({
    electronLauncher: fixture.launcher, env: {}, repoRoot: 'C:\\repo', wait
  });
  expect(fixture.launcher.launch).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenCalledOnce();
  expect(wait).toHaveBeenCalledWith(100);
  await session.close();
});

it('does not retry unrelated or expired launch failures', async () => {
  const unrelated = launcherFixture();
  unrelated.launcher.launch.mockRejectedValue(new Error('executable missing'));
  await expect(openPairSyncDesktopSession({
    electronLauncher: unrelated.launcher, env: {}, repoRoot: 'C:\\repo', wait: vi.fn()
  })).rejects.toMatchObject({ stage: 'desktop-runtime-launch' });
  expect(unrelated.launcher.launch).toHaveBeenCalledOnce();

  const expired = launcherFixture();
  expired.launcher.launch.mockRejectedValue(
    new Error('Lock file can not be created! Error code: 32')
  );
  await expect(openPairSyncDesktopSession({
    electronLauncher: expired.launcher, env: {}, now: () => 10,
    profileLockRetryTimeoutMs: 0, repoRoot: 'C:\\repo', wait: vi.fn()
  })).rejects.toMatchObject({ stage: 'desktop-runtime-launch' });
  expect(expired.launcher.launch).toHaveBeenCalledOnce();
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
