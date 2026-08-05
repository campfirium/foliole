// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { prepareIosRuntimeContractCache } from './ios-local-storage.mjs';

it('routes reusable Swift caches and scratch builds into one cache entry', () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'foliole-ios-storage-'));
  try {
    expect(prepareIosRuntimeContractCache(repoRoot)).toEqual({
      clangModuleCache: path.join(repoRoot, '.cache/ios-runtime-contract/clang'),
      scratchPath: path.join(repoRoot, '.cache/ios-runtime-contract/scratch'),
      swiftpmModuleCache: path.join(repoRoot, '.cache/ios-runtime-contract/swiftpm')
    });
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});
