// @vitest-environment node
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

it('retains mobile guard settings across a browser process restart and applies them in actual creation', async () => {
  const { stdout } = await promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('./companionClozeGuardSettings.test-support.mjs', import.meta.url))],
    { cwd: process.cwd(), timeout: 90000, maxBuffer: 1024 * 1024 });
  expect(JSON.parse(stdout.trim().split('\n').at(-1) ?? 'null')).toMatchObject({ passed: true, errors: [] });
}, 100000);
