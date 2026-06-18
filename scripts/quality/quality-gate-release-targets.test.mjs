// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };

import { describe, expect, it } from 'vitest';

import { releaseScripts, runTargetGate, writePackageJson } from './quality-gate-release-targets.support.mjs';

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

      const result = await runTargetGate(tempRoot, 'release-core');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('release desktop src test ok');
      expect(result.stdout).toContain('release desktop electron test ok');
      expect(result.stdout).toContain('release windows core test ok');
      expect(result.stdout).toContain('release android test ok');
      expect(result.stdout).toContain('release shared test ok');
      expect(result.stdout).toContain('release quality core test ok');
      expect(result.stdout).toContain('release quality gate test ok');
      expect(result.stdout).toContain('release quality node test ok');
      expect(result.stdout).toContain('release quality preview test ok');
      expect(result.stdout).toContain(
        '[quality-gate:release-core] running in parallel: test:release:desktop-src test:desktop:electron test:windows:core test:release:android test:release:shared test:quality:core test:quality:gate test:quality:node'
      );
      expect(result.stdout).not.toContain('release windows preview recovery test ok');
      expect(result.stdout).not.toContain('release android sync ok');
      expect(result.stdout).toContain('[quality-gate:release-core] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it.each([
    {
      expected: ['android boundary ok', 'release lint ok', 'release desktop typecheck ok', 'release android typecheck ok'],
      name: 'guards, lint, and typecheck',
      rejected: ['release desktop src test ok', 'release vite build ok'],
      target: 'release-static'
    },
    {
      expected: ['release desktop src test ok', 'release windows core test ok', 'release android test ok', 'release shared test ok', 'release quality gate test ok'],
      name: 'non-preview test buckets',
      rejected: ['release quality preview test ok', 'release preview recovery test ok', 'release vite build ok'],
      target: 'release-tests'
    },
    {
      expected: ['release quality preview test ok', 'release vite build ok', 'release electron compile ok', 'release android web build ok'],
      name: 'release build outputs',
      rejected: ['release desktop src test ok', 'release windows preview recovery test ok'],
      target: 'release-build'
    },
    {
      expected: ['release quality preview test ok'],
      name: 'script preview tests',
      rejected: ['release desktop src test ok', 'release windows preview recovery test ok'],
      target: 'release-script-preview'
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

  it('keeps release-preview-recovery isolated to slow Windows recovery tests', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, 'release-preview-recovery');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('release windows preview recovery test ok');
      expect(result.stdout).not.toContain('release desktop test ok');
      expect(result.stdout).not.toContain('release windows core test ok');
      expect(result.stdout).not.toContain('release android sync ok');
      expect(result.stdout).toContain('[quality-gate:release-preview-recovery] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps full isolated to release core plus preview recovery without android host checks', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, 'full');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('release lint ok');
      expect(result.stdout).toContain('release desktop typecheck ok');
      expect(result.stdout).toContain('release android typecheck ok');
      expect(result.stdout).toContain('release desktop src test ok');
      expect(result.stdout).toContain('release desktop electron test ok');
      expect(result.stdout).toContain('release windows core test ok');
      expect(result.stdout).toContain('release windows preview recovery test ok');
      expect(result.stdout).toContain('release android test ok');
      expect(result.stdout).toContain('release shared test ok');
      expect(result.stdout).toContain('release quality core test ok');
      expect(result.stdout).toContain('release quality gate test ok');
      expect(result.stdout).toContain('release quality node test ok');
      expect(result.stdout).toContain('release quality preview test ok');
      expect(result.stdout).toContain('release vite build ok');
      expect(result.stdout).toContain('release electron compile ok');
      expect(result.stdout).toContain('release android web build ok');
      expect(result.stdout).not.toContain('release android sync ok');
      expect(result.stdout).not.toContain('release android host lint ok');
      expect(result.stdout).not.toContain('release android host test ok');
      expect(result.stdout).toContain('[quality-gate:full] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps full release coverage as core plus preview recovery plus android host', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, 'release');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('release windows core test ok');
      expect(result.stdout).toContain('release windows preview recovery test ok');
      expect(result.stdout).toContain('release android sync ok');
      expect(result.stdout).toContain('release android host lint ok');
      expect(result.stdout).toContain('release android host test ok');
      expect(result.stdout).toContain('[quality-gate:release] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps release-android-host isolated to sync and host checks', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, releaseScripts());

      const result = await runTargetGate(tempRoot, 'release-android-host');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('release android sync ok');
      expect(result.stdout).toContain('release android host lint ok');
      expect(result.stdout).toContain('release android host test ok');
      expect(result.stdout).not.toContain('release lint ok');
      expect(result.stdout).not.toContain('release shared test ok');
      expect(result.stdout).not.toContain('release android web build ok');
      expect(result.stdout).toContain('[quality-gate:release-android-host] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);
});
