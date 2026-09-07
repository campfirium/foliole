// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { parseWindowsDevControlArgs } from './windows-dev-control.mjs';
import { runWindowsReadwiseApiImportAcceptance } from './windows-readwise-api-import-action.mjs';

it('registers and runs the fixed Windows Reader API import acceptance', async () => {
  expect(parseWindowsDevControlArgs(['readwise-api-import'], {}))
    .toMatchObject({ action: 'readwise-api-import' });
  const paths = {
    repoRoot: 'D:\\C\\foliole', systemNode: 'node.exe', systemNpmCli: 'npm-cli.js'
  };
  const execute = vi.fn(async () => ({ code: 0, output: 'passed' }));

  await expect(runWindowsReadwiseApiImportAcceptance('readwise-api-import', execute, paths))
    .resolves.toMatchObject({ readwiseApiImport: { resultStatus: 'passed' } });
  expect(execute).toHaveBeenCalledWith(paths.systemNode, [
    paths.systemNpmCli, 'run', 'test:e2e:desktop:native:hidden', '--',
    'tests/desktop/t178-4-readwise-api-import.spec.ts',
    'tests/desktop/t178-6-readwise-api-original-file.spec.ts'
  ], expect.objectContaining({ cwd: paths.repoRoot }));
});
