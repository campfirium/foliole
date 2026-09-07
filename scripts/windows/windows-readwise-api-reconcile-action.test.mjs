// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { parseWindowsDevControlArgs } from './windows-dev-control.mjs';
import {
  runWindowsReadwiseApiReconcileAcceptance
} from './windows-readwise-api-reconcile-action.mjs';

it('registers and runs the fixed Windows Reader API reconciliation acceptance', async () => {
  expect(parseWindowsDevControlArgs(['readwise-api-reconcile'], {}))
    .toMatchObject({ action: 'readwise-api-reconcile' });
  const paths = { repoRoot: 'D:\\C\\foliole', systemNode: 'node.exe', systemNpmCli: 'npm-cli.js' };
  const execute = vi.fn(async () => ({ code: 0, output: 'passed' }));
  await expect(runWindowsReadwiseApiReconcileAcceptance('readwise-api-reconcile', execute, paths))
    .resolves.toMatchObject({ readwiseApiReconcile: { resultStatus: 'passed' } });
  expect(execute).toHaveBeenCalledWith(paths.systemNode, [
    paths.systemNpmCli, 'run', 'test:e2e:desktop:native:hidden', '--',
    'tests/desktop/t178-7-readwise-api-reconcile.spec.ts'
  ], expect.objectContaining({ cwd: paths.repoRoot }));
});
