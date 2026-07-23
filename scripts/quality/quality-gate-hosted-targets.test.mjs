// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };

import { describe, expect, it } from 'vitest';

import { releaseScripts, runTargetGate, writePackageJson } from './quality-gate-release-targets.support.mjs';

const DRY_RUN_ENV = { QUALITY_GATE_TEST_DRY_RUN_STEPS: '1' };

function dryRunSteps(stdout) {
  return [...stdout.matchAll(/dry-run step: ([^\n]+)/gu)].map((match) => match[1]);
}

describe('hosted quality target boundaries', () => {
  it('exposes dedicated Common and Windows aliases', () => {
    expect(packageJson.scripts['quality:release:hosted-common']).toBe(
      'bash scripts/quality/quality-gate-target.sh release-hosted-common'
    );
    expect(packageJson.scripts['quality:release:windows:core']).toBe(
      'bash scripts/quality/quality-gate-target.sh release-windows-core'
    );
  });

  it.each([
    {
      expected: ['test:release:desktop-src', 'test:release:android', 'test:release:shared', 'test:desktop:electron'],
      rejected: ['test:windows:core', 'test:windows:native-preview', 'android:sync'],
      target: 'release-hosted-common'
    },
    {
      expected: ['build:vite-only', 'electron:compile', 'android:web:build'],
      rejected: ['test:quality:preview', 'test:windows:core', 'test:release:desktop-src'],
      target: 'release-hosted-common-build'
    },
    {
      expected: ['test:windows:core'],
      rejected: ['test:release:desktop-src', 'test:release:android', 'test:windows:native-preview'],
      target: 'release-windows-core'
    }
  ])('keeps $target on its job boundary', async ({ expected, rejected, target }) => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-hosted-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());
      const result = await runTargetGate(tempRoot, target, DRY_RUN_ENV);
      expect(result.code).toBe(0);
      for (const scriptName of expected) {
        expect(result.stdout).toContain(`dry-run step: ${scriptName}`);
      }
      for (const scriptName of rejected) {
        expect(result.stdout).not.toContain(`dry-run step: ${scriptName}`);
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps staged Common jobs exactly equivalent to the hosted Common gate', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-hosted-equivalence-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());
      const [original, staticGate, toolingGate, buildGate] = await Promise.all([
        runTargetGate(tempRoot, 'release-hosted-common', DRY_RUN_ENV),
        runTargetGate(tempRoot, 'release-static', DRY_RUN_ENV),
        runTargetGate(tempRoot, 'release-tooling', DRY_RUN_ENV),
        runTargetGate(tempRoot, 'release-hosted-common-build', DRY_RUN_ENV)
      ]);
      for (const result of [original, staticGate, toolingGate, buildGate]) expect(result.code).toBe(0);

      const productDomains = [
        'test:release:desktop-src',
        'test:release:android',
        'test:release:shared',
        'test:desktop:electron'
      ];
      const staged = [
        ...dryRunSteps(staticGate.stdout),
        ...productDomains,
        ...dryRunSteps(toolingGate.stdout),
        ...dryRunSteps(buildGate.stdout)
      ];
      expect(staged.toSorted()).toEqual(dryRunSteps(original.stdout).toSorted());
      expect(staged.filter((step) => step === 'test:quality:preview')).toHaveLength(1);
      expect(staged).not.toContain('test:windows:core');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);
});
