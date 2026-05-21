// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { requestDevShellRestart } from './devShellRestartRequest.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-dev-shell-restart-'));
  tempDirs.push(dir);
  return dir;
}

it('writes a dev shell restart request when a request file is configured', () => {
  const requestFile = path.join(createTempDir(), 'restart.json');

  expect(
    requestDevShellRestart({
      now: () => new Date('2026-05-21T08:00:00.000Z'),
      reason: 'test-restart',
      requestFile
    })
  ).toBe(true);

  const parsed = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
  expect(parsed).toMatchObject({
    kind: 'foliole-dev-shell-restart',
    reason: 'test-restart',
    requestedAt: '2026-05-21T08:00:00.000Z'
  });
  expect(parsed.id).toEqual(expect.any(String));
});

it('does not request a restart when no dev shell request file is configured', () => {
  expect(requestDevShellRestart({ reason: 'missing-file', requestFile: '' })).toBe(false);
});
