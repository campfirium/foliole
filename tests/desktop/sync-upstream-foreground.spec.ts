import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

// Real window focus drives the desktop sync priority (needs the visible runner); the lock is an emitted power event.
test('takes the sync foreground after a settled focus and gives it up on screen lock', async ({ desktopApp, desktopWindow }) => {
  test.info().annotations.push({ type: 'calibrated-ms', description: String(40_000) });
  await expectWorkspaceShell(desktopWindow);
  const presence = () => desktopApp.evaluate(() => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    return require(`${process.cwd()}/dist/electron/sync/desktopForegroundPresence.js`).isDesktopForeground() as boolean;
  });
  const focusedAt = await desktopApp.evaluate(({ BrowserWindow }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    require(`${process.cwd()}/dist/electron/sync/desktopForegroundPresenceRuntime.js`).installDesktopForegroundPresence();
    BrowserWindow.getAllWindows()[0]!.focus();
    return Date.now();
  });
  await new Promise(resolve => setTimeout(resolve, 8_000));
  expect(await presence()).toBe(false);
  await expect.poll(presence, { timeout: 8_000, interval: 200 }).toBe(true);
  expect(Date.now() - focusedAt).toBeGreaterThanOrEqual(10_000);

  await desktopApp.evaluate(({ powerMonitor }) => { powerMonitor.emit('lock-screen'); });
  expect(await presence()).toBe(false);
  await desktopApp.evaluate(({ powerMonitor }) => { powerMonitor.emit('unlock-screen'); });
});

test('keeps the last real sync result while the root only serves downstream devices', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const result = await desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const coordinator = require(`${process.cwd()}/dist/electron/sync/desktopSyncCoordinator.js`);
    const { runWithDatabaseConnectionOwner } = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const sessions = require(`${process.cwd()}/dist/electron/sync/desktopSyncChangeSessions.js`).desktopSyncChangeSessions();
    const before = await runWithDatabaseConnectionOwner(() => coordinator.loadDesktopSyncTriggerResult());
    const downstream = sessions.open('downstream-desktop');
    try {
      const served = await coordinator.runDesktopSyncCoordinator('automatic');
      const after = await runWithDatabaseConnectionOwner(() => coordinator.loadDesktopSyncTriggerResult());
      return { served: served.status, unchanged: JSON.stringify(after) === JSON.stringify(before), session: downstream.session };
    } finally { sessions.closeAll(); }
  });
  expect(result).toMatchObject({ served: 'skipped', unchanged: true });
});
