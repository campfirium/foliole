// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { expectNoQualityMonolithStep, expectStep, QUALITY_SCRIPT_STEPS } from './quality-gate-target-test-support.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-target.sh');
const DRY_RUN_ENV = { QUALITY_GATE_TEST_CONTEXT: '1', QUALITY_GATE_TEST_DRY_RUN_STEPS: '1' };

function runTargetGate(cwd, target) {
  return new Promise((resolve) => {
    const child = spawn('bash', [TARGET_SCRIPT, target], {
      cwd,
      env: { ...process.env, QUALITY_GATE_LOG_MODE: 'summary', ...DRY_RUN_ENV }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function writePackageJson(rootDir, scripts) {
  const fixtureScripts = {
    'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
    ...scripts
  };
  for (const bucket of [
    'test:desktop',
    'test:windows:core',
    'test:windows:native-preview',
    'test:release:desktop-src',
    'test:release:android',
    'test:release:shared',
    'test:quality',
    'test:quality:core',
    'test:quality:gate',
    'test:quality:gate-integration',
    'test:quality:gate-integration:routing',
    'test:quality:gate-integration:fast-delegation',
    'test:quality:gate-integration:targets',
    'test:quality:gate-integration:target-core',
    'test:quality:gate-integration:target-failures',
    'test:quality:gate-integration:target-collect',
    'test:quality:gate-integration:target-telemetry',
    'test:quality:gate-integration:release-targets',
    'test:quality:gate-integration:release-tail',
    'test:quality:node',
    'test:quality:preview'
  ]) {
    fixtureScripts[bucket] ??= scripts['test:full'] ?? 'node -e "console.log(\'bucket ok\')"';
  }
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name: 'quality-gate-target-fixture', private: true, scripts: fixtureScripts }, null, 2)}\n`,
    'utf8'
  );
}

async function writeWorkspaceBoundaryScript(rootDir, message = 'workspace boundary ok') {
  const scriptsDir = path.join(rootDir, 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(path.join(scriptsDir, 'check-workspace-settings-boundary.mjs'), `console.log('${message}')\n`, 'utf8');
}

async function writeRepositoryRootBoundaryScript(rootDir, message = 'repository root boundary ok') {
  const scriptsDir = path.join(rootDir, 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(path.join(scriptsDir, 'check-repository-root-boundary.mjs'), `console.log('${message}')\n`, 'utf8');
}

async function writeCopyGuardScript(rootDir, message = 'copy guard ok') {
  const scriptsDir = path.join(rootDir, 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(path.join(scriptsDir, 'check-ui-copy-guard.mjs'), `console.log('${message}')\n`, 'utf8');
}

describe('quality-gate-target.sh', () => {
  it('runs the desktop gate steps in order', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'copy:guard': 'node scripts/check-ui-copy-guard.mjs',
        'lint:desktop:full': 'node -e "console.log(\'desktop full lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'desktop typecheck ok\')"',
        'test:desktop': 'node -e "console.log(\'desktop test ok\')"',
        'test:windows:core': 'node -e "console.log(\'windows core test ok\')"',
        build: 'node -e "console.log(\'desktop build ok\')"',
        'electron:compile': 'node -e "console.log(\'electron compile ok\')"'
      });
      await writeCopyGuardScript(tempRoot);
      await writeRepositoryRootBoundaryScript(tempRoot);
      await writeWorkspaceBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'desktop');

      expect(result.code).toBe(0);
      for (const scriptName of [
        'copy:guard',
        'lint:desktop:full',
        'typecheck:desktop',
        'test:desktop',
        'test:windows:core',
        ...QUALITY_SCRIPT_STEPS,
        'build',
        'electron:compile'
      ]) expectStep(result.stdout, scriptName);
      expectNoQualityMonolithStep(result.stdout);
      expect(result.stdout).toContain('repository root boundary ok');
      expect(result.stdout).toContain('workspace boundary ok');
      expect(result.stdout).toContain('[quality-gate:desktop] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('runs the android gate including host test', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
        'lint:android:full': 'node -e "console.log(\'android full lint ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
        'test:android': 'node -e "console.log(\'android test ok\')"',
        'android:sync': 'node -e "console.log(\'android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'android host test ok\')"'
      });
      await writeRepositoryRootBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'android');

      expect(result.code).toBe(0);
      for (const scriptName of [
        'lint:android:full',
        'typecheck:android',
        'test:android',
        ...QUALITY_SCRIPT_STEPS,
        'android:sync',
        'android:host:lint',
        'android:host:test'
      ]) expectStep(result.stdout, scriptName);
      expectNoQualityMonolithStep(result.stdout);
      expect(result.stdout).toContain('repository root boundary ok');
      expectStep(result.stdout, 'check:android-boundary');
      expect(result.stdout).toContain('[quality-gate:android] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('runs the android device gate including emulator and connected test', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:android:full': 'node -e "console.log(\'android full lint ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
        'test:android': 'node -e "console.log(\'android test ok\')"',
        'android:sync': 'node -e "console.log(\'android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'android host test ok\')"',
        'android:emulator': 'node -e "console.log(\'android emulator ok\')"',
        'android:host:device-test': 'node -e "console.log(\'android connected test ok\')"'
      });
      await writeRepositoryRootBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'android-device');

      expect(result.code).toBe(0);
      for (const scriptName of [
        'lint:android:full',
        'typecheck:android',
        'test:android',
        ...QUALITY_SCRIPT_STEPS,
        'android:sync',
        'android:host:lint',
        'android:host:test',
        'android:emulator',
        'android:host:device-test'
      ]) expectStep(result.stdout, scriptName);
      expectNoQualityMonolithStep(result.stdout);
      expect(result.stdout).toContain('repository root boundary ok');
      expect(result.stdout).toContain('[quality-gate:android-device] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('runs the shared gate without requiring android host test', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-target-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:shared:full': 'node -e "console.log(\'shared full lint ok\')"',
        'typecheck:shared': 'node -e "console.log(\'shared typecheck ok\')"',
        'test:shared': 'node -e "console.log(\'shared test ok\')"',
        build: 'node -e "console.log(\'shared build ok\')"',
        'electron:compile': 'node -e "console.log(\'shared electron compile ok\')"',
        'android:web:build': 'node -e "console.log(\'shared android build ok\')"'
      });
      await writeRepositoryRootBoundaryScript(tempRoot);
      await writeWorkspaceBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'shared');

      expect(result.code).toBe(0);
      for (const scriptName of [
        'lint:shared:full',
        'typecheck:shared',
        'test:shared',
        ...QUALITY_SCRIPT_STEPS,
        'build',
        'electron:compile',
        'android:web:build'
      ]) expectStep(result.stdout, scriptName);
      expectNoQualityMonolithStep(result.stdout);
      expect(result.stdout).toContain('repository root boundary ok');
      expect(result.stdout).toContain('workspace boundary ok');
      expect(result.stdout).toContain('[quality-gate:shared] all checks passed.');
      expect(result.stdout).not.toContain('android sync ok');
      expect(result.stdout).not.toContain('android host lint ok');
      expect(result.stdout).not.toContain('android host test ok');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);
});
