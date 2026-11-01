// @vitest-environment node
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

it('persists a cloze and closes its selection through a pending refresh and subsequent Flow', async () => {
  const artifacts = path.join(process.cwd(), '.tmp/artifacts/T673-28');
  await mkdir(artifacts, { recursive: true });
  const fixtureRoot = await mkdtemp(path.join(artifacts, 'companion-cloze-clean-'));
  const artifactRoot = path.join(fixtureRoot, 'missing-parent', 'T673-18');
  expect(existsSync(artifactRoot)).toBe(false);
  const { stdout } = await promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('./companionSelectionCloze.test-support.mjs', import.meta.url)), artifactRoot],
    { cwd: process.cwd(), timeout: 90000, maxBuffer: 1024 * 1024 });
  const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? 'null');
  expect(result).toMatchObject({ closed: true, flow: true, items: 2 });
  expect(path.dirname(result.output)).toBe(artifactRoot);
}, 100000);
