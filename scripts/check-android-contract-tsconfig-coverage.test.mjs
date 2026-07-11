// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  discoverAndroidContractFiles,
  findMissingContractFiles,
  parseProgramFiles
} from './check-android-contract-tsconfig-coverage.mjs';

const tempRoots = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('Android contract tsconfig coverage', () => {
  it('discovers production contracts dynamically and excludes tests', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-android-contracts-'));
    tempRoots.push(repoRoot);
    const databaseDir = path.join(repoRoot, 'lib', 'core', 'database');
    await mkdir(databaseDir, { recursive: true });
    await writeFile(path.join(databaseDir, 'androidCompanionAlphaDefinitions.ts'), 'export {};');
    await writeFile(path.join(databaseDir, 'androidCompanionBetaRules.ts'), 'export {};');
    await writeFile(path.join(databaseDir, 'androidCompanionAlphaDefinitions.test.ts'), 'export {};');
    await writeFile(path.join(databaseDir, 'other.ts'), 'export {};');

    expect(discoverAndroidContractFiles(repoRoot)).toEqual([
      'lib/core/database/androidCompanionAlphaDefinitions.ts',
      'lib/core/database/androidCompanionBetaRules.ts'
    ]);
  });

  it('reports every production contract missing from compiler output', () => {
    const repoRoot = path.resolve('D:/workspace/foliole');
    const programFiles = parseProgramFiles(repoRoot, [
      path.join(repoRoot, 'lib/core/database/androidCompanionAlphaDefinitions.ts'),
      path.join(repoRoot, 'lib/core/database/helper.ts')
    ].join('\n'));

    expect(findMissingContractFiles([
      'lib/core/database/androidCompanionAlphaDefinitions.ts',
      'lib/core/database/androidCompanionBetaRules.ts'
    ], programFiles)).toEqual(['lib/core/database/androidCompanionBetaRules.ts']);
  });
});
