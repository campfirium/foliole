// @vitest-environment node

import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { runMacosElectronDevSupervisor } from './macos-electron-dev-supervisor.mjs';
import { resolveMacosElectronDevPaths } from './macos-electron-dev-paths.mjs';

vi.mock('../lib/resource-gate.mjs', () => ({
  withResourceGate: vi.fn(async () => { throw new Error('waiting for resource gate'); })
}));

it('preserves another build cache and old evidence while DEV waits for resources', async () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'foliole-dev-storage-'));
  const cache = path.join(root, '.cache', 'ios-physical-acceptance');
  const evidence = path.join(root, '.tmp', 'artifacts', 'fixture', 'previous-run');
  try {
    for (const directory of [cache, evidence]) {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'payload'), 'preserve');
      const old = new Date(Date.now() - 31 * 86400_000);
      fs.utimesSync(directory, old, old);
    }
    await expect(runMacosElectronDevSupervisor({
      paths: resolveMacosElectronDevPaths(root),
      platform: 'darwin',
      prepareSignature: async () => undefined
    })).rejects.toThrow('waiting for resource gate');
    for (const directory of [cache, evidence]) {
      expect(fs.readFileSync(path.join(directory, 'payload'), 'utf8')).toBe('preserve');
    }
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});
