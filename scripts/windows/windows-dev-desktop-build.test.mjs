import { expect, it, vi } from 'vitest';

import { runWindowsDevDesktopBuild } from './windows-dev-desktop-build.mjs';

it('restores lockfile dependencies before compiling the Windows desktop', async () => {
  const checked = vi.fn(async (_execute, _command, args) => ({
    output: `${args.join(' ')}\n`
  }));
  const paths = { repoRoot: 'D:\\C\\foliole', systemNode: 'node.exe',
    systemNpmCli: 'npm-cli.js' };

  const output = await runWindowsDevDesktopBuild(vi.fn(), paths, checked);

  expect(checked.mock.calls.map((call) => call[2])).toEqual([
    ['npm-cli.js', 'install', '--ignore-scripts', '--no-audit', '--no-fund'],
    ['npm-cli.js', 'run', 'build'],
    ['npm-cli.js', 'run', 'electron:compile']
  ]);
  expect(output).toContain('install --ignore-scripts');
});
