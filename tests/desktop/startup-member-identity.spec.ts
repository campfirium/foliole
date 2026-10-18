import path from 'node:path';

import { closeDesktopApplication } from '../../scripts/desktop/playwright-desktop-close.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';

test('daily DEV resolves the same native Mac device location as the installed channel', async ({ desktopApp }) => {
  // SKIP: macOS App Group contract | 2026-10-19 | revive: running on macOS
  test.skip(process.platform !== 'darwin', 'macOS App Group contract');
  const locations = await desktopApp.evaluate(() => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const anchors = require(`${process.cwd()}/dist/electron/deviceAnchorStore.js`);
    return {
      installed: anchors.resolveDesktopDeviceAnchorFilePath({ env: {} }),
      daily: anchors.resolveDesktopDeviceAnchorFilePath({
        env: { ...process.env, FOLIOLE_MACOS_DAILY_DEBUG: '1' }
      }),
      isolated: anchors.resolveDesktopDeviceAnchorFilePath({
        env: { ...process.env, FOLIOLE_MACOS_DAILY_DEBUG: undefined }
      })
    };
  });
  expect(locations.daily).toBe(locations.installed);
  expect(locations.isolated).not.toBe(locations.installed);
});

test('opens a library carried over from another device under a new member identity', async ({ desktopSession }, info) => {
  const foreign = await desktopSession.electronApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const load = (name: string) => require(`${process.cwd()}/dist/${name}.js`);
    return load('electron/database/connection').runWithDatabaseConnectionOwner(() => {
      const identity = load('lib/platform/syncGroupUnifiedContract').createSyncGroupDeviceIdentity({
        device_anchor: '11111111-1111-4111-8111-111111111111', group_id: 'carried-library',
        library_path: '/other/device/library.db', path_flavor: 'posix'
      });
      load('electron/database/syncGroupStore').createDesktopSyncGroup({
        device: identity, deviceName: 'Other device', platform: 'darwin'
      });
      return identity.identity_key as string;
    });
  });
  const stateRoot = (desktopSession.target as { runtimeStateRoot: string }).runtimeStateRoot;
  await closeDesktopApplication(desktopSession.electronApp);
  const second = await launchDesktopSession({
    env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
  }) as DesktopSession;
  try {
    await expect(second.firstWindow.getByRole('main', { name: /^(Foliole workspace|Foliole 工作区)$/ })).toBeVisible();
    const group = await second.electronApp.evaluate(async () => {
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      const load = (name: string) => require(`${process.cwd()}/dist/${name}.js`);
      return load('electron/database/connection').runWithDatabaseConnectionOwner(() =>
        load('electron/database/syncGroupStore').loadDesktopSyncGroup());
    }) as { group_id: string; local_device_identity_key: string; devices: Array<{ device_identity_key: string }> };
    expect(group.group_id).toBe('carried-library');
    expect(group.local_device_identity_key).not.toBe(foreign);
    expect(group.devices.map((device) => device.device_identity_key))
      .toEqual(expect.arrayContaining([foreign, group.local_device_identity_key]));
    const screenshot = path.resolve('.tmp/artifacts/startup-member-identity-rebound.png');
    await second.firstWindow.screenshot({ path: screenshot });
    await info.attach('carried-library-rebound', { path: screenshot, contentType: 'image/png' });
  } finally {
    await second.close();
  }
});
