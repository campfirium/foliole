// @vitest-environment node
/* global process */

import { expect, it } from 'vitest';

import { execute } from './macos-a5-process.mjs';

it('preserves bounded child output when a command times out', async () => {
  const command = process.execPath;
  const pending = execute(command, [
    '-e',
    "process.stdout.write('stage=pair-target\\n');" +
      "process.stderr.write('detail=waiting\\n');setInterval(() => {}, 1000)"
  ], { timeoutCode: 'pair_timeout', timeoutMs: 200 });

  await expect(pending).rejects.toMatchObject({
    code: 'pair_timeout',
    result: {
      lines: ['stage=pair-target', 'detail=waiting'],
      output: 'stage=pair-target\ndetail=waiting\n',
      stderr: 'detail=waiting\n',
      stdout: 'stage=pair-target\n'
    }
  });
});
