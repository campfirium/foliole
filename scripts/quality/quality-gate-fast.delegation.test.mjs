// @vitest-environment node

import { rm } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  createQualityGateTempRoot,
  runQualityGate,
  writeFixtureFile,
  writePackageJson
} from './quality-gate-fast.test-support.mjs';

const DRY_RUN_ENV = { QUALITY_GATE_TEST_DRY_RUN_STEPS: '1' };

describe('quality-gate-fast.sh delegation', () => {
  it('routes mixed android and shared runtime changes to the shared gate', async () => {
    const tempRoot = await createQualityGateTempRoot();
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'repo lint should stay unused\')"'
      });

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_CHANGED_FILES: [
          'scripts/android/android-boundary-quality-gate.test.mjs',
          'lib/core/database/numberedMigrations.ts'
        ].join('\n')
      }, ['--route']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-route] selected level: shared');
      expect(result.stdout).toContain('shared runtime or store changed');
      expect(result.stdout).toContain('[quality-gate-route] target: quality:shared');
      expect(result.stdout).not.toContain('repo lint should stay unused');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('keeps test-only Android script changes on the related-test route', async () => {
    const tempRoot = await createQualityGateTempRoot();
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'repo lint should stay unused\')"',
        typecheck: 'node -e "console.log(\'typecheck should stay unused\')"'
      });

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_CHANGED_FILES: 'scripts/android/android-boundary-quality-gate.test.mjs'
      }, ['--route']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-route] selected level: mid');
      expect(result.stdout).toContain('[quality-gate-route] reason: test files changed');
      expect(result.stdout).toContain('[quality-gate-route] target: scoped lint + typecheck + workspace boundary + related tests');
      expect(result.stdout).toContain('scripts/android/android-boundary-quality-gate.test.mjs');
      expect(result.stdout).not.toContain('quality:android');
      expect(result.stdout).not.toContain('repo lint should stay unused');
      expect(result.stdout).not.toContain('typecheck should stay unused');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it.each(['--full', '--release'])('rejects the removed local aggregate override %s', async (argument) => {
    const tempRoot = await createQualityGateTempRoot();
    try {
      await writePackageJson(tempRoot, {
        'quality:full': 'node -e "console.log(\'full gate should stay unused\')"',
        'quality:release': 'node -e "console.log(\'release gate should stay unused\')"'
      });

      const result = await runQualityGate(tempRoot, DRY_RUN_ENV, [argument]);

      expect(result.code).toBe(2);
      expect(result.stdout).toContain('aggregate quality is hosted-only');
      expect(result.stdout).not.toContain('gate should stay unused');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('caps Android path changes locally and defers hosted quality to scheduled T6', async () => {
    const tempRoot = await createQualityGateTempRoot();
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'full lint should stay unused\')"',
        'lint:android:full': 'node -e "console.log(\'android full lint ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
        'test:android': 'node -e "console.log(\'android test ok\')"',
        'test:quality': 'node -e "console.log(\'quality test ok\')"',
        'android:sync': 'node -e "console.log(\'android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'android host test ok\')"'
      });
      await writeFixtureFile(tempRoot, 'scripts/check-repository-root-boundary.mjs', 'console.log("boundary ok");\n');

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_CHANGED_FILES: 'src/companion/App.tsx'
      });

      expect(result.code, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] selected level: android');
      expect(result.stdout).toContain('hosted quality deferred to scheduled T6');
      expect(result.stdout).toContain('android typecheck ok');
      expect(result.stdout).not.toContain('android full lint ok');
      expect(result.stdout).not.toContain('android host test ok');
      expect(result.stdout).not.toContain('full lint should stay unused');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 90000);

  it('routes iOS changes to hosted contract quality without starting a local Simulator', async () => {
    const tempRoot = await createQualityGateTempRoot();
    try {
      await writePackageJson(tempRoot, {
        'quality:ios': 'node -e "console.log(\'local Simulator should stay unused\')"',
        'quality:ios:contract': 'node -e "console.log(\'local iOS contract should stay unused\')"'
      });
      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_CHANGED_FILES: 'ios/App/App/AppDelegate.swift'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] selected level: ios');
      expect(result.stdout).toContain('hosted quality deferred to scheduled T6');
      expect(result.stdout).not.toContain('local Simulator should stay unused');
      expect(result.stdout).not.toContain('local iOS contract should stay unused');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});
