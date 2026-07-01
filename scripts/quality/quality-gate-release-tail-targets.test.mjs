// @vitest-environment node
/* global process */

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { releaseScripts, runTargetGate, writePackageJson } from './quality-gate-release-targets.support.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-target.sh');
const DRY_RUN_ENV = { QUALITY_GATE_TEST_CONTEXT: '1', QUALITY_GATE_TEST_DRY_RUN_STEPS: '1' };

function expectStep(stdout, scriptName) {
  expect(stdout).toContain(`dry-run step: ${scriptName}`);
}

function expectNoStep(stdout, scriptName) {
  expect(stdout).not.toContain(`dry-run step: ${scriptName}`);
}

function runTargetGateWithEnv(cwd, target, env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [TARGET_SCRIPT, target], {
      cwd,
      env: { ...process.env, QUALITY_GATE_LOG_MODE: 'summary', ...env }
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

describe('quality-gate release base and tail targets', () => {
  it.each([
    {
      expected: ['test:release:desktop-src', 'test:release:android', 'test:quality:preview', 'android:web:build'],
      name: 'the canonical release base aggregate',
      rejected: ['test:windows:preview-recovery', 'android:sync'],
      target: 'release-base'
    },
    {
      expected: ['test:windows:preview-recovery'],
      name: 'Windows preview recovery',
      rejected: ['test:release:desktop-src', 'android:sync'],
      target: 'release-windows-tail'
    },
    {
      expected: ['android:sync', 'android:host:lint', 'android:host:test'],
      name: 'Android host checks',
      rejected: ['test:release:shared', 'android:web:build'],
      target: 'release-android-tail'
    },
    {
      expected: ['test:quality:core', 'test:quality:gate', 'test:quality:node', 'test:quality:preview'],
      name: 'quality tooling self-tests',
      rejected: ['test:release:desktop-src', 'test:windows:preview-recovery'],
      target: 'release-tooling'
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

  it('keeps release gate acceleration scoped to bucket-level parallelism by default', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, {
        ...releaseScripts(),
        'quality:ios':
          'node -e "console.log(\'workers=\' + process.env.VITEST_MAX_WORKERS + \';file=\' + process.env.VITEST_FILE_PARALLELISM + \';jobs=\' + process.env.QUALITY_GATE_PARALLEL_MAX_JOBS)"'
      });

      const result = await runTargetGate(tempRoot, 'release-ios-tail');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('workers=undefined;file=undefined;jobs=4');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('lets callers lower release gate acceleration when a machine is constrained', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, {
        ...releaseScripts(),
        'quality:ios':
          'node -e "console.log(\'workers=\' + process.env.VITEST_MAX_WORKERS + \';file=\' + process.env.VITEST_FILE_PARALLELISM + \';jobs=\' + process.env.QUALITY_GATE_PARALLEL_MAX_JOBS)"'
      });

      const result = await runTargetGateWithEnv(tempRoot, 'release-ios-tail', {
        QUALITY_GATE_PARALLEL_MAX_JOBS: '2',
        VITEST_FILE_PARALLELISM: '0',
        VITEST_MAX_WORKERS: '2'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('workers=2;file=0;jobs=2');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);
});
