import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function descendants(rootPid: number) {
  const entries = (await readdir('/proc')).filter((entry) => /^\d+$/u.test(entry));
  const processes = await Promise.all(entries.map(async (entry) => {
    try {
      const status = await readFile(path.join('/proc', entry, 'status'), 'utf8');
      const parent = Number(status.match(/^PPid:\s+(\d+)$/mu)?.[1]);
      const command = (await readFile(path.join('/proc', entry, 'cmdline'))).toString().replaceAll('\0', ' ').trim();
      return { command, parent, pid: Number(entry), status };
    } catch {
      return null;
    }
  }));
  const selected = [];
  const pending = [rootPid];
  while (pending.length > 0) {
    const parent = pending.shift()!;
    for (const entry of processes) {
      if (entry?.parent !== parent || selected.some((item) => item.pid === entry.pid)) continue;
      selected.push(entry);
      pending.push(entry.pid);
    }
  }
  return selected;
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
  const processTree = await descendants(desktopSession.electronApp.process().pid!);
  expect(processTree.some((entry) => entry.command.includes('--type=renderer'))).toBe(true);
  expect(processTree.every((entry) => !entry.command.includes('--no-sandbox'))).toBe(true);
  expect(processTree.filter((entry) => entry.command.includes('--type=renderer'))
    .every((entry) => /^Seccomp:\s+2$/mu.test(entry.status))).toBe(true);
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
