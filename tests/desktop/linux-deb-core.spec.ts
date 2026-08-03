import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function readLinuxProcess(pid: number) {
  const status = await readFile(path.join('/proc', String(pid), 'status'), 'utf8');
  const command = (await readFile(path.join('/proc', String(pid), 'cmdline')))
    .toString().replaceAll('\0', ' ').trim();
  return { command, status };
}

test('runs the installed Linux DEB with Chromium sandbox and desktop core', async ({
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
  expect(identity).toEqual({ architecture: 'x64', noSandbox: false, platform: 'linux', version: expectedVersion });
  const nativeWindow = await desktopSession.electronApp.browserWindow(desktopWindow);
  const rendererPid = await nativeWindow.evaluate(({ webContents }) => webContents.getOSProcessId());
  const renderer = await readLinuxProcess(rendererPid);
  expect(renderer.command).not.toContain('--no-sandbox');
  expect(renderer.status).toMatch(/^Seccomp:\s+2$/mu);
  const profile = await readFile(`/proc/${desktopSession.electronApp.process().pid}/attr/current`, 'utf8');
  expect(profile).toContain('foliole');
  await desktopWindow.evaluate(async () => {
    await globalThis.window?.__folioleWorkspaceDebug?.seedNodes?.([{
      content: '# Linux DEB acceptance', id: 'linux-deb-acceptance', kind: 'topic', title: 'Linux DEB acceptance'
    }]);
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.('linux-deb-acceptance');
  });
  await expect.poll(() => desktopWindow.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.())).toBe('linux-deb-acceptance');
});
