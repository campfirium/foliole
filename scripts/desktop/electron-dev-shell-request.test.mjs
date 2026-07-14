// @vitest-environment node

import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ELECTRON_DEV_SHELL_REQUEST_KIND,
  writeElectronDevShellRequest
} from './electron-dev-shell-request.mjs';

describe('Electron dev shell request writer', () => {
  it('writes the existing electron-dev request contract', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'electron-shell-request-'));
    const filePath = path.join(root, '.foliole-dev-shell-restart-request.json');
    const request = await writeElectronDevShellRequest({
      bootSession: 'macos-daily-next',
      filePath,
      now: () => new Date('2026-07-14T00:00:00.000Z'),
      reason: 'compile inputs changed',
      runtimeHead: 'head-a',
      uuid: () => 'request-a'
    });

    expect(request).toEqual({
      bootSession: 'macos-daily-next',
      id: 'request-a',
      kind: ELECTRON_DEV_SHELL_REQUEST_KIND,
      reason: 'compile inputs changed',
      requestedAt: '2026-07-14T00:00:00.000Z',
      runtimeHead: 'head-a',
      shellAction: 'restart-runtime'
    });
    await expect(readFile(filePath, 'utf8')).resolves.toContain('"kind": "foliole-dev-shell-restart"');
  });
});
