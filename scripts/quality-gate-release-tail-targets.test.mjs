// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { releaseScripts, runTargetGate, writePackageJson } from './quality-gate-release-targets.support.mjs';

describe('quality-gate release base and tail targets', () => {
  it.each([
    {
      expected: ['release desktop src test ok', 'release android test ok', 'release quality preview test ok', 'release android web build ok'],
      name: 'the canonical release base aggregate',
      rejected: ['release windows preview recovery test ok', 'release android sync ok'],
      target: 'release-base'
    },
    {
      expected: ['release windows preview recovery test ok'],
      name: 'Windows preview recovery',
      rejected: ['release desktop src test ok', 'release android sync ok'],
      target: 'release-windows-tail'
    },
    {
      expected: ['release android sync ok', 'release android host lint ok', 'release android host test ok'],
      name: 'Android host checks',
      rejected: ['release shared test ok', 'release android web build ok'],
      target: 'release-android-tail'
    },
    {
      expected: ['release quality core test ok', 'release quality gate test ok', 'release quality node test ok', 'release quality preview test ok'],
      name: 'quality tooling self-tests',
      rejected: ['release desktop src test ok', 'release windows preview recovery test ok'],
      target: 'release-tooling'
    }
  ])('keeps $target isolated to $name', async ({ expected, rejected, target }) => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, target);

      expect(result.code).toBe(0);
      for (const text of expected) expect(result.stdout).toContain(text);
      for (const text of rejected) expect(result.stdout).not.toContain(text);
      expect(result.stdout).toContain(`[quality-gate:${target}] all checks passed.`);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps release-ios-tail isolated to the iOS release placeholder', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, {
        ...releaseScripts(),
        'quality:ios': 'node -e "console.log(\'release ios boundary ok\')"'
      });

      const result = await runTargetGate(tempRoot, 'release-ios-tail');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('release ios boundary ok');
      expect(result.stdout).not.toContain('release desktop src test ok');
      expect(result.stdout).not.toContain('release android sync ok');
      expect(result.stdout).toContain('[quality-gate:release-ios-tail] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);
});
