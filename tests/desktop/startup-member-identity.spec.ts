import path from 'node:path';

import { expect, test } from './harness/fixtures';

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

test('explains a rejected library identity on the native startup error page', async ({ desktopApp, desktopWindow }, info) => {
  const message = await desktopApp.evaluate(async ({ BrowserWindow }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const load = (name: string) => require(`${process.cwd()}/dist/${name}.js`);
    const connection = load('electron/database/connection');
    const failure = await connection.runWithDatabaseConnectionOwner(() => {
      const identity = load('lib/platform/syncGroupUnifiedContract').createSyncGroupDeviceIdentity({
        device_anchor: '11111111-1111-4111-8111-111111111111', group_id: 'wrong-device',
        library_path: '/other/device/library.db', path_flavor: 'posix'
      });
      load('electron/database/syncGroupStore').createDesktopSyncGroup({
        device: identity, deviceName: 'Other device', platform: 'darwin'
      });
      try {
        load('electron/database/startupMemberIdentity').assertStartupMemberIdentity(connection.openDatabaseConnection());
      } catch (error) {
        if (error instanceof Error && error.name === 'LibraryIdentityMismatch') return error.message;
        throw error;
      }
      throw new Error('Expected the copied member identity to be rejected.');
    });
    await load('electron/rendererLoader').loadRenderer(BrowserWindow.getAllWindows()[0], `${process.cwd()}/dist/electron`, {
      errorSummary: failure, kind: 'startup-error', logPath: '/isolated/diagnostics', moduleLabel: 'Database migration'
    });
    return failure;
  });
  await expect(desktopWindow.getByRole('alert')).toContainText(message);
  await expect(desktopWindow.getByRole('alert')).toContainText('original device');
  const screenshot = path.resolve('.tmp/artifacts/startup-member-identity.png');
  await desktopWindow.screenshot({ path: screenshot });
  await info.attach('library-identity-mismatch', { path: screenshot, contentType: 'image/png' });
});
