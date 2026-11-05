// @vitest-environment node
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

it('keeps the real mobile selection session through cancel, cloze and highlight confirmation', async () => {
  const { stdout } = await promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('./companionClozeGuard.test-support.mjs', import.meta.url))],
    { cwd: process.cwd(), timeout: 90000, maxBuffer: 1024 * 1024 });
  const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? 'null');
  expect(result).toMatchObject({ passed: true, errors: [] });
}, 100000);
