// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };

import { describe, expect, it } from 'vitest';

import { releaseScripts, runTargetGate, writePackageJson } from './quality-gate-release-targets.support.mjs';

const DRY_RUN_ENV = { QUALITY_GATE_TEST_DRY_RUN_STEPS: '1' };

function expectStep(stdout, scriptName) {
  expect(stdout).toContain(`dry-run step: ${scriptName}`);
}

function expectNoStep(stdout, scriptName) {
  expect(stdout).not.toContain(`dry-run step: ${scriptName}`);
}

describe('quality-gate release split targets', () => {
  it('exposes release core and tail package aliases', () => {
    expect(packageJson.scripts['quality:release:core']).toBe('bash scripts/quality/quality-gate-target.sh release-core');
    expect(packageJson.scripts['quality:release:fail-fast']).toBe('bash scripts/quality/quality-gate-target.sh release --fail-fast');
    expect(packageJson.scripts['quality:release:preview-recovery']).toBe(
      'bash scripts/quality/quality-gate-target.sh release-preview-recovery'
    );
    expect(packageJson.scripts['quality:release:base']).toBe('bash scripts/quality/quality-gate-target.sh release-base');
    expect(packageJson.scripts['quality:release:windows:tail']).toBe(
      'bash scripts/quality/quality-gate-target.sh release-windows-tail'
    );
    expect(packageJson.scripts['quality:release:android:tail']).toBe(
      'bash scripts/quality/quality-gate-target.sh release-android-tail'
    );
    expect(packageJson.scripts['quality:release:ios:tail']).toBe(
      'bash scripts/quality/quality-gate-target.sh release-ios-tail'
    );
    expect(packageJson.scripts['quality:release:tooling']).toBe('bash scripts/quality/quality-gate-target.sh release-tooling');
  });

  it('keeps release-core isolated from preview recovery and android host checks', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, 'release-core', DRY_RUN_ENV);

      expect(result.code).toBe(0);
      for (const scriptName of [
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
        'test:quality:preview'
      ]) expectStep(result.stdout, scriptName);
      expect(result.stdout).toContain(
        '[quality-gate:release-core] running in parallel: test:release:desktop-src test:windows:core test:release:android test:release:shared test:quality:core test:quality:gate test:quality:node'
      );
      expectNoStep(result.stdout, 'test:windows:native-preview');
      expectNoStep(result.stdout, 'android:sync');
      expect(result.stdout).toContain('[quality-gate:release-core] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it.each([
    {
      expected: ['check:android-boundary', 'lint:full', 'typecheck:desktop', 'typecheck:android'],
      name: 'guards, lint, and typecheck',
      rejected: ['test:release:desktop-src', 'build:vite-only'],
      target: 'release-static'
    },
    {
      expected: ['test:release:desktop-src', 'test:windows:core', 'test:release:android', 'test:release:shared', 'test:quality:gate', 'test:quality:gate-integration:routing', 'test:quality:gate-integration:fast-delegation', 'test:quality:gate-integration:target-core',
        'test:quality:gate-integration:target-failures',
        'test:quality:gate-integration:target-collect',
        'test:quality:gate-integration:target-telemetry', 'test:quality:gate-integration:release-targets', 'test:quality:gate-integration:release-tail'],
      name: 'non-preview test buckets',
      rejected: ['test:quality:preview', 'test:windows:native-preview', 'build:vite-only'],
      target: 'release-tests'
    },
    {
      expected: ['test:quality:preview', 'build:vite-only', 'electron:compile', 'android:web:build'],
      name: 'release build outputs',
      rejected: ['test:release:desktop-src', 'test:windows:native-preview'],
      target: 'release-build'
    },
    {
      expected: ['test:quality:preview'],
      name: 'script preview tests',
      rejected: ['test:release:desktop-src', 'test:windows:native-preview'],
      target: 'release-script-preview'
    }
  ])('keeps $target isolated to $name', async ({ expected, rejected, target }) => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, target, DRY_RUN_ENV);

      expect(result.code).toBe(0);
      for (const scriptName of expected) expectStep(result.stdout, scriptName);
      for (const scriptName of rejected) expectNoStep(result.stdout, scriptName);
      expect(result.stdout).toContain(`[quality-gate:${target}] all checks passed.`);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps release-preview-recovery isolated to slow Windows recovery tests', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, 'release-preview-recovery', DRY_RUN_ENV);

      expect(result.code).toBe(0);
      expectStep(result.stdout, 'test:windows:native-preview');
      expectNoStep(result.stdout, 'test:desktop');
      expectNoStep(result.stdout, 'test:windows:core');
      expectNoStep(result.stdout, 'android:sync');
      expect(result.stdout).toContain('[quality-gate:release-preview-recovery] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps full isolated to release core plus preview recovery without android host checks', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, 'full', DRY_RUN_ENV);

      expect(result.code).toBe(0);
      for (const scriptName of [
        'lint:full',
        'typecheck:desktop',
        'typecheck:android',
        'test:release:desktop-src',
        'test:desktop:electron',
        'test:windows:core',
        'test:windows:native-preview',
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
        'build:vite-only',
        'electron:compile',
        'android:web:build'
      ]) expectStep(result.stdout, scriptName);
      expectNoStep(result.stdout, 'android:sync');
      expectNoStep(result.stdout, 'android:host:lint');
      expectNoStep(result.stdout, 'android:host:test');
      expect(result.stdout).toContain('[quality-gate:full] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps full release coverage as core plus preview recovery plus android host', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, 'release', DRY_RUN_ENV);

      expect(result.code).toBe(0);
      expectStep(result.stdout, 'test:windows:core');
      expectStep(result.stdout, 'test:windows:native-preview');
      expectStep(result.stdout, 'android:sync');
      expectStep(result.stdout, 'android:host:lint');
      expectStep(result.stdout, 'android:host:test');
      expect(result.stdout).toContain('[quality-gate:release] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps release-android-host isolated to sync and host checks', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, 'release-android-host', DRY_RUN_ENV);

      expect(result.code).toBe(0);
      expectStep(result.stdout, 'android:sync');
      expectStep(result.stdout, 'android:host:lint');
      expectStep(result.stdout, 'android:host:test');
      expectNoStep(result.stdout, 'lint:full');
      expectNoStep(result.stdout, 'test:release:shared');
      expectNoStep(result.stdout, 'android:web:build');
      expect(result.stdout).toContain('[quality-gate:release-android-host] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);
});
