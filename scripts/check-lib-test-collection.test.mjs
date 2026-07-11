// @vitest-environment node

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  findMissingTests,
  normalizeRepoPath,
  parseCollectedLibTests
} from './check-lib-test-collection.mjs';

describe('lib test collection check', () => {
  it('normalizes absolute test paths to repository-relative POSIX paths', () => {
    const repoRoot = path.resolve('D:/workspace/foliole');

    expect(normalizeRepoPath(repoRoot, path.join(repoRoot, 'lib', 'core', 'sample.test.ts')))
      .toBe('lib/core/sample.test.ts');
  });

  it('keeps only legal collected tests under lib', () => {
    const repoRoot = path.resolve('D:/workspace/foliole');
    const output = JSON.stringify([
      { file: path.join(repoRoot, 'lib', 'core', 'one.test.ts') },
      { file: path.join(repoRoot, 'lib', 'core', 'two.test.tsx') },
      { file: path.join(repoRoot, 'src', 'shared', 'lib', 'other.test.ts') }
    ]);

    expect(parseCollectedLibTests(repoRoot, output)).toEqual([
      'lib/core/one.test.ts',
      'lib/core/two.test.tsx'
    ]);
  });

  it('reports every discovered test missing from the collected set', () => {
    expect(findMissingTests(
      ['lib/one.test.ts', 'lib/two.test.ts'],
      ['lib/two.test.ts']
    )).toEqual(['lib/one.test.ts']);
  });
});
