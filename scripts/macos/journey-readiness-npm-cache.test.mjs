// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { materializeLocalSourceCapsule, cleanupLocalSourceCapsule } from './journey-readiness-mac-adapter.mjs';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

afterEach(() => vi.resetAllMocks());

it('installs inside the frozen source with a repository-owned cache that survives cleanup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'journey-npm-cache-'));
  try {
    const artifacts = path.join(root, 'artifacts');
    const buildRoot = path.join(artifacts, 'source');
    const cache = path.join(root, '.cache/npm-downloads');
    fs.mkdirSync(artifacts);
    spawnSync.mockImplementation((command, args) => {
      if (command === 'git') fs.writeFileSync(path.join(artifacts, 'source.tar'), 'archive');
      if (command === 'npm' && args[0] === 'ci') {
        fs.mkdirSync(args[args.indexOf('--cache') + 1], { recursive: true });
        fs.writeFileSync(path.join(cache, 'preserved'), 'cached archive');
        fs.mkdirSync(path.join(buildRoot, 'node_modules'));
      }
      if (command === 'npm' && args[0] === 'run') {
        fs.mkdirSync(path.join(buildRoot, 'dist/companion'), { recursive: true });
        fs.writeFileSync(path.join(buildRoot, 'dist/companion/index.html'), 'built');
      }
      return { status: 0 };
    });
    const capsule = materializeLocalSourceCapsule(root, artifacts, { revision: 'frozen' });
    expect(spawnSync).toHaveBeenCalledWith('npm', ['ci', '--cache', cache],
      expect.objectContaining({ cwd: buildRoot }));
    expect(fs.existsSync(path.join(buildRoot, 'node_modules'))).toBe(true);
    cleanupLocalSourceCapsule(capsule);
    expect(fs.existsSync(buildRoot)).toBe(false);
    expect(fs.readFileSync(path.join(cache, 'preserved'), 'utf8')).toBe('cached archive');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
