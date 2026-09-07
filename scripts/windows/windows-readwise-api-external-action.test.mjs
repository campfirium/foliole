// @vitest-environment node

import { expect, test, vi } from 'vitest';

import { parseWindowsDevControlArgs } from './windows-dev-control.mjs';
import { runWindowsReadwiseApiExternalAcceptance } from './windows-readwise-api-external-action.mjs';

test('routes the Readwise API External acceptance action', async () => {
  expect(parseWindowsDevControlArgs(['readwise-api-external'], {}))
    .toMatchObject({ action: 'readwise-api-external' });
  const execute = vi.fn().mockResolvedValue({ code: 0, output: 'passed' });
  const paths = { repoRoot: 'D:\\C\\foliole', systemNode: 'node.exe', systemNpmCli: 'npm-cli.js' };

  await expect(runWindowsReadwiseApiExternalAcceptance('readwise-api-external', execute, paths))
    .resolves.toMatchObject({ readwiseApiExternal: { resultStatus: 'passed' } });
  expect(execute.mock.calls[0]?.[1]).toContain('tests/desktop/t178-5-readwise-api-external.spec.ts');
});
