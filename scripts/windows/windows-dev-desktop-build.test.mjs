// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { runWindowsDevDesktopBuild } from './windows-dev-desktop-build.mjs';

it('keeps the ordinary desktop build free of route-specific native work', async () => {
  const paths = {
    repoRoot: 'D:\\C\\foliole',
    systemNode: 'C:\\Program Files\\nodejs\\node.exe',
    systemNpmCli: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'
  };
  const execute = vi.fn();
  const checked = vi.fn(async (_execute, command, args, options, stage) => ({
    output: `${stage}:${command}:${args.join(' ')}:${options.timeoutCode}\n`
  }));

  await runWindowsDevDesktopBuild(execute, paths, checked);

  expect(checked.mock.calls.map(([, command, args, , stage]) => ({ args, command, stage })))
    .toEqual([
      { args: [paths.systemNpmCli, 'run', 'build'], command: paths.systemNode,
        stage: 'desktop-build' },
      { args: [paths.systemNpmCli, 'run', 'electron:compile'], command: paths.systemNode,
        stage: 'desktop-build' },
    ]);
});
