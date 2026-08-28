// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { runWindowsDevGradleBuild } from './windows-dev-gradle-build.mjs';

it('uses the fixed no-daemon task and reports its direct child', async () => {
  const execute = vi.fn(async (_command, _args, options) => {
    options.onSpawn({ pid: 42 });
    return { code: 0, output: 'BUILD SUCCESSFUL\n' };
  });
  await expect(runWindowsDevGradleBuild(execute, {
    androidSdk: 'sdk', javaHome: 'java', repoRoot: 'repo', signingHome: 'signing'
  }, 'win32', 'build')).resolves.toEqual({ directChildPid: 42, output: 'BUILD SUCCESSFUL\n' });
  expect(execute.mock.calls[0][1]).toEqual([
    '/d', '/s', '/c', 'call .\\gradlew.bat --no-daemon assembleDebugAndroidTest'
  ]);
});
