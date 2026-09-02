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

it('materializes the frozen dependency graph for a sync candidate', async () => {
  const paths = {
    repoRoot: 'D:\\C\\foliole', systemNode: 'node.exe', systemNpmCli: 'npm-cli.js'
  };
  const checked = vi.fn(async () => ({ output: '' }));

  await runWindowsDevDesktopBuild(vi.fn(), paths, checked, { materializeDependencies: true });

  expect(checked.mock.calls.map(([, , args, , stage]) => ({ args, stage }))).toEqual([
    { args: [paths.systemNpmCli, 'ci'], stage: 'desktop-dependencies' },
    { args: ['D:\\C\\foliole\\node_modules\\electron\\install.js'],
      stage: 'desktop-electron-runtime' },
    { args: [paths.systemNpmCli, 'run', 'build'], stage: 'desktop-build' },
    { args: [paths.systemNpmCli, 'run', 'electron:compile'], stage: 'desktop-build' },
    { args: [paths.systemNpmCli, 'run', 'electron:rebuild:native'],
      stage: 'desktop-native-rebuild' }
  ]);
});
