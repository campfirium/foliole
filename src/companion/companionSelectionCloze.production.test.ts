// @vitest-environment node
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

it('persists a cloze and closes its selection through a pending refresh and subsequent Flow', async () => {
  const { stdout } = await promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('./companionSelectionCloze.test-support.mjs', import.meta.url))],
    { cwd: process.cwd(), timeout: 90000, maxBuffer: 1024 * 1024 });
  expect(JSON.parse(stdout.trim().split('\n').at(-1) ?? 'null')).toMatchObject({ closed: true, flow: true, items: 2 });
}, 100000);
