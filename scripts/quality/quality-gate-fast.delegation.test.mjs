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

function expectStep(stdout, scriptName) {
  expect(stdout).toContain(`dry-run step: ${scriptName}`);
}

function expectNoStep(stdout, scriptName) {
  expect(stdout).not.toContain(`dry-run step: ${scriptName}`);
}

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

  it('delegates to the full gate when forced', async () => {
    const tempRoot = await createQualityGateTempRoot();
    try {
      await writePackageJson(tempRoot, {
        'lint:full': 'node -e "console.log(\'full lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'full desktop typecheck ok\')"',
        'typecheck:android': 'node -e "console.log(\'full android typecheck ok\')"',
        'test:release:desktop-src': 'node -e "console.log(\'full deduped test ok\')"',
        'test:desktop:electron': 'node -e "console.log(\'full electron test ok\')"',
        'test:windows:core': 'node -e "console.log(\'full windows test ok\')"',
        'test:release:android': 'node -e "console.log(\'full android test ok\')"',
        'test:release:shared': 'node -e "console.log(\'full shared test ok\')"',
        'test:quality:core': 'node -e "console.log(\'full quality core ok\')"',
        'test:quality:gate': 'node -e "console.log(\'full quality gate ok\')"',
        'test:quality:gate-integration': 'node -e "console.log(\'full quality gate integration ok\')"',
        'test:quality:gate-integration:routing': 'node -e "console.log(\'full quality gate integration routing ok\')"',
        'test:quality:gate-integration:fast-delegation': 'node -e "console.log(\'full quality gate integration fast delegation ok\')"',
        'test:quality:gate-integration:targets': 'node -e "console.log(\'full quality gate integration targets ok\')"',
        'test:quality:gate-integration:target-core': 'node -e "console.log(\'full quality gate integration target core ok\')"',
        'test:quality:gate-integration:target-failures': 'node -e "console.log(\'full quality gate integration target failures ok\')"',
        'test:quality:gate-integration:target-collect': 'node -e "console.log(\'full quality gate integration target collect ok\')"',
        'test:quality:gate-integration:target-telemetry': 'node -e "console.log(\'full quality gate integration target telemetry ok\')"',
        'test:quality:gate-integration:release-targets': 'node -e "console.log(\'full quality gate integration release targets ok\')"',
        'test:quality:gate-integration:release-tail': 'node -e "console.log(\'full quality gate integration release tail ok\')"',
        'test:quality:node': 'node -e "console.log(\'full quality node ok\')"',
        'test:quality:preview': 'node -e "console.log(\'full quality preview ok\')"',
        'test:windows:preview-recovery': 'node -e "console.log(\'full preview recovery ok\')"',
        'build:vite-only': 'node -e "console.log(\'full vite build ok\')"',
        'electron:compile': 'node -e "console.log(\'full electron compile ok\')"',
        'android:web:build': 'node -e "console.log(\'full android web build ok\')"',
        'android:sync': 'node -e "console.log(\'full android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'full android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'full android host test ok\')"'
      });

      const result = await runQualityGate(tempRoot, DRY_RUN_ENV, ['--full']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] forcing full quality gate');
      expect(result.stdout).toContain('[quality-gate:full] all checks passed.');
      for (const scriptName of [
        'lint:full',
        'typecheck:desktop',
        'typecheck:android',
        'test:release:desktop-src',
        'test:desktop:electron',
        'test:windows:core',
        'test:release:android',
        'test:release:shared',
        'test:quality:core',
        'test:quality:gate',
        'test:quality:gate-integration:routing',
        'test:quality:gate-integration:fast-delegation',
        'test:quality:gate-integration:target-core',
        'test:quality:gate-integration:target-failures',
        'test:quality:gate-integration:target-collect',
        'test:quality:gate-integration:target-telemetry',
        'test:quality:gate-integration:release-targets',
        'test:quality:gate-integration:release-tail',
        'test:quality:node',
        'test:quality:preview',
        'test:windows:preview-recovery',
        'build:vite-only',
        'electron:compile',
        'android:web:build'
      ]) expectStep(result.stdout, scriptName);
      expectNoStep(result.stdout, 'android:sync');
      expectNoStep(result.stdout, 'android:host:lint');
      expectNoStep(result.stdout, 'android:host:test');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 90000);

  it('delegates to the release gate when forced', async () => {
    const tempRoot = await createQualityGateTempRoot();
    try {
      await writePackageJson(tempRoot, {
        'lint:full': 'node -e "console.log(\'release lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'release desktop typecheck ok\')"',
        'typecheck:android': 'node -e "console.log(\'release android typecheck ok\')"',
        'test:release:desktop-src': 'node -e "console.log(\'release deduped test ok\')"',
        'test:desktop:electron': 'node -e "console.log(\'release electron test ok\')"',
        'test:windows:core': 'node -e "console.log(\'release windows test ok\')"',
        'test:release:android': 'node -e "console.log(\'release android test ok\')"',
        'test:release:shared': 'node -e "console.log(\'release shared test ok\')"',
        'test:quality:core': 'node -e "console.log(\'release quality core ok\')"',
        'test:quality:gate': 'node -e "console.log(\'release quality gate ok\')"',
        'test:quality:gate-integration': 'node -e "console.log(\'release quality gate integration ok\')"',
        'test:quality:gate-integration:routing': 'node -e "console.log(\'release quality gate integration routing ok\')"',
        'test:quality:gate-integration:fast-delegation': 'node -e "console.log(\'release quality gate integration fast delegation ok\')"',
        'test:quality:gate-integration:targets': 'node -e "console.log(\'release quality gate integration targets ok\')"',
        'test:quality:gate-integration:target-core': 'node -e "console.log(\'release quality gate integration target core ok\')"',
        'test:quality:gate-integration:target-failures': 'node -e "console.log(\'release quality gate integration target failures ok\')"',
        'test:quality:gate-integration:target-collect': 'node -e "console.log(\'release quality gate integration target collect ok\')"',
        'test:quality:gate-integration:target-telemetry': 'node -e "console.log(\'release quality gate integration target telemetry ok\')"',
        'test:quality:gate-integration:release-targets': 'node -e "console.log(\'release quality gate integration release targets ok\')"',
        'test:quality:gate-integration:release-tail': 'node -e "console.log(\'release quality gate integration release tail ok\')"',
        'test:quality:node': 'node -e "console.log(\'release quality node ok\')"',
        'test:quality:preview': 'node -e "console.log(\'release quality preview ok\')"',
        'test:windows:preview-recovery': 'node -e "console.log(\'release preview recovery ok\')"',
        'build:vite-only': 'node -e "console.log(\'release vite build ok\')"',
        'electron:compile': 'node -e "console.log(\'release electron compile ok\')"',
        'android:web:build': 'node -e "console.log(\'release android web build ok\')"',
        'android:sync': 'node -e "console.log(\'release android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'release android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'release android host test ok\')"'
      });

      const result = await runQualityGate(tempRoot, DRY_RUN_ENV, ['--release']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] forcing release quality gate');
      expect(result.stdout).toContain('[quality-gate:release] all checks passed.');
      for (const scriptName of [
        'lint:full',
        'typecheck:desktop',
        'typecheck:android',
        'test:release:desktop-src',
        'test:desktop:electron',
        'test:windows:core',
        'test:release:android',
        'test:release:shared',
        'test:quality:core',
        'test:quality:gate',
        'test:quality:gate-integration:routing',
        'test:quality:gate-integration:fast-delegation',
        'test:quality:gate-integration:target-core',
        'test:quality:gate-integration:target-failures',
        'test:quality:gate-integration:target-collect',
        'test:quality:gate-integration:target-telemetry',
        'test:quality:gate-integration:release-targets',
        'test:quality:gate-integration:release-tail',
        'test:quality:node',
        'test:quality:preview',
        'test:windows:preview-recovery',
        'build:vite-only',
        'electron:compile',
        'android:web:build',
        'android:sync',
        'android:host:lint',
        'android:host:test'
      ]) expectStep(result.stdout, scriptName);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 90000);

  it('delegates android path changes to the android gate', async () => {
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

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] selected level: android');
      expect(result.stdout).toContain('[quality-gate:android] all checks passed.');
      expect(result.stdout).toContain('android full lint ok');
      expect(result.stdout).toContain('android host test ok');
      expect(result.stdout).not.toContain('full lint should stay unused');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 90000);
});
