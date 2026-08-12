// @vitest-environment node
/* global process */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import {
  freshJourneyFactIds, startWindowsARejoinProvider
} from './multi-device-sync-a-rejoin-provider.mjs';

const roots = [];

afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

it('releases the fixed Windows provider only after consumer completion', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a-rejoin-provider-'));
  roots.push(repoRoot);
  const evidenceRoot = path.join(repoRoot, 'evidence');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const remoteRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/windows-c/run-1');
  fs.mkdirSync(remoteRoot, { recursive: true });
  fs.writeFileSync(path.join(remoteRoot, 'multi-device-sync-a-rejoin-receipt.json'),
    JSON.stringify({ factIds: { A: 'a', B: 'b', C: 'c' } }), 'utf8');
  let finishWindows;
  const execute = vi.fn((_command, args) => args.at(-1) === 'multi-device-sync-provider-complete'
    ? Promise.resolve({ code: 0 })
    : new Promise((resolve) => { finishWindows = () => resolve({
      code: 0, output: '[windows-dev-action] multi-device-sync-a-rejoin identity=run-1\n'
    }); }));
  const provider = startWindowsARejoinProvider({ evidenceRoot, execute, repoRoot });
  await provider.release('consumer_complete');
  finishWindows();
  await expect(provider.finish()).resolves.toMatchObject({ receipt: { factIds: { C: 'c' } } });
  expect(execute).toHaveBeenCalledWith(process.execPath, [
    'scripts/windows/windows-dev-control.mjs', 'multi-device-sync-provider-complete'
  ], expect.objectContaining({ action: 'windows-c-provider-release' }));
});

it('derives one fresh identity per device without reusing the prior journey', () => {
  expect(freshJourneyFactIds({ old: 'A', a: 'A', b: 'B', c: 'C' }, new Set(['old'])))
    .toEqual({ A: 'a', B: 'b', C: 'c' });
});
