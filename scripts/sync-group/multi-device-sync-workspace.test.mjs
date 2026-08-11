import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import {
  assertIsolatedMacosRoot, cleanupOwnedRun, createIsolatedMacosRoot
} from './multi-device-sync-workspace.mjs';

it('creates and removes only a run-owned isolated macOS library', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-owner-'));
  const created = createIsolatedMacosRoot({ repoRoot, runId: 'run-1' });
  expect(created.root).toContain(path.join('.tmp', 'artifacts', 'multi-device-sync', 'runs', 'run-1'));
  cleanupOwnedRun({ repoRoot, runId: 'run-1' });
  expect(fs.existsSync(path.dirname(created.root))).toBe(false);
});

it('rejects personal, unknown, and mismatched owners', () => {
  expect(() => assertIsolatedMacosRoot({ repoRoot: '/Users/roamer/P/Foliole',
    root: '/Users/roamer/Documents/Foliole', runId: 'run-1' }))
    .toThrow('escaped the isolated root');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-owner-'));
  const root = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs/run-1/macos-a');
  fs.mkdirSync(root, { recursive: true });
  expect(() => assertIsolatedMacosRoot({ repoRoot, root, runId: 'run-1' }))
    .toThrow('owner marker is missing');
  fs.writeFileSync(path.join(root, 'acceptance-owner.json'), JSON.stringify({
    purpose: 'multi-device-sync-acceptance', runId: 'another-run'
  }));
  expect(() => assertIsolatedMacosRoot({ repoRoot, root, runId: 'run-1' }))
    .toThrow('owner marker differs');
});
