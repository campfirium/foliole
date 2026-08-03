import process from 'node:process';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('runs the packaged Linux x64 AppImage with its native sandbox and desktop core', async ({
  desktopSession,
  desktopWindow
}) => {
  const expectedVersion = process.env.FOLIOLE_LINUX_EXPECTED_VERSION;
  expect(desktopSession.target.launchMode).toBe('installed');
  await expectWorkspaceShell(desktopWindow);
  const identity = await desktopSession.electronApp.evaluate(({ app }) => ({
    architecture: process.arch,
    noSandbox: app.commandLine.hasSwitch('no-sandbox'),
    platform: process.platform,
    version: app.getVersion()
  }));
  expect(identity).toEqual({
    architecture: 'x64',
    noSandbox: false,
    platform: 'linux',
    version: expectedVersion
  });
  await desktopWindow.evaluate(async () => {
    await globalThis.window?.__folioleWorkspaceDebug?.seedNodes?.([{
      content: '# Linux AppImage acceptance',
      id: 'linux-appimage-acceptance',
      kind: 'topic',
      title: 'Linux AppImage acceptance'
    }]);
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.('linux-appimage-acceptance');
  });
  await expect.poll(() => desktopWindow.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.())).toBe('linux-appimage-acceptance');
});
