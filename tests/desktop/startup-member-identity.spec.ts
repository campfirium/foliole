import path from 'node:path';

import { expect, test } from './harness/fixtures';

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
