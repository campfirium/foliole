// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { parseWindowsDevControlArgs } from './windows-dev-control.mjs';
import { runWindowsReadwiseApiConnectionAcceptance } from './windows-readwise-api-connection-action.mjs';

it('registers a fixed Windows DEV action for Readwise API connection acceptance', () => {
  expect(parseWindowsDevControlArgs(['readwise-api-connection'], {}))
    .toMatchObject({ action: 'readwise-api-connection' });
});

it('runs the fixed Readwise API connection desktop acceptance without rebuilding', async () => {
  const paths = {
    repoRoot: 'D:\\C\\foliole', systemNode: 'node.exe', systemNpmCli: 'npm-cli.js'
  };
  const execute = vi.fn(async () => ({ code: 0, output: 'passed' }));

  await expect(runWindowsReadwiseApiConnectionAcceptance(
    'readwise-api-connection', execute, paths
  )).resolves.toMatchObject({ readwiseApiConnection: { resultStatus: 'passed' } });
  expect(execute).toHaveBeenCalledWith(paths.systemNode, [
    paths.systemNpmCli, 'run', 'test:e2e:desktop:native:hidden', '--',
    'tests/desktop/t178-2-readwise-api-connection.spec.ts'
  ], expect.objectContaining({ cwd: paths.repoRoot }));
});
