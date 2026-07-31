// @vitest-environment node
/* global process */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  QUALITY_SCRIPT_STEPS,
  expectNoParallelFanOut,
  expectNoQualityMonolithStep,
  expectStep,
  extractQualityScriptSteps
} from './quality-gate-target-test-support.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-target.sh');
const DRY_RUN_ENV = { QUALITY_GATE_TEST_CONTEXT: '1', QUALITY_GATE_TEST_DRY_RUN_STEPS: '1' };
const ok = (message) => `node -e "console.log('${message}')"`;

function runTargetGate(cwd, target, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [TARGET_SCRIPT, target], {
      cwd,
      env: {
        ...process.env,
        GITHUB_ACTIONS: 'true',
        QUALITY_GATE_LOG_MODE: 'summary',
        RUNNER_ENVIRONMENT: 'github-hosted',
        ...DRY_RUN_ENV,
        ...env
      }
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

async function writePackageJson(rootDir) {
  const scripts = {
    'check:android-boundary': ok('android boundary ok'),
    'lint:shared:full': ok('shared lint ok'),
    'typecheck:shared': ok('shared typecheck ok'),
    'test:shared': ok('shared tests ok'),
    build: ok('build ok'),
    'electron:compile': ok('electron compile ok'),
    'android:web:build': ok('android web build ok')
  };
  for (const step of QUALITY_SCRIPT_STEPS) {
    scripts[step] = ok(`${step} ok`);
  }
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name: 'quality-gate-shared-segments-fixture', private: true, scripts }, null, 2)}\n`,
    'utf8'
  );
}

describe('quality-gate-target.sh shared segments', () => {
  it.each([
    ['shared-static', ['check:android-boundary', 'lint:shared:full', 'typecheck:shared']],
    ['shared-test', ['test:shared']],
    ['shared-quality-tests', QUALITY_SCRIPT_STEPS],
    ['shared-build', ['build', 'electron:compile', 'android:web:build']]
  ])('runs only the %s segment steps', async (target, expectedSteps) => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-shared-segments-'));
    try {
      await writePackageJson(tempRoot);

      const result = await runTargetGate(tempRoot, target);

      expect(result.code).toBe(0);
      for (const step of expectedSteps) {
        expectStep(result.stdout, step);
      }
      expectNoQualityMonolithStep(result.stdout);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps shared quality tests on the sequential heavy-bucket route', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-shared-segments-'));
    try {
      await writePackageJson(tempRoot);

      const result = await runTargetGate(tempRoot, 'shared-quality-tests');

      expect(result.code).toBe(0);
      expectNoParallelFanOut(result.stdout);
      expect(extractQualityScriptSteps(result.stdout)).toEqual([...QUALITY_SCRIPT_STEPS].sort());
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('skips shared quality script self-tests for ordinary product changes', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-shared-segments-'));
    try {
      await writePackageJson(tempRoot);

      const result = await runTargetGate(tempRoot, 'shared', { QUALITY_GATE_CHANGED_FILES: 'src/app/example.ts' });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('dry-run step: lint:shared:full');
      expect(result.stdout).toContain('dry-run step: typecheck:shared');
      expect(result.stdout).toContain('dry-run step: test:shared');
      expect(result.stdout).toContain('dry-run step: build');
      expect(result.stdout).toContain('skipped quality script self-tests');
      for (const step of QUALITY_SCRIPT_STEPS) {
        expect(result.stdout).not.toContain(`dry-run step: ${step}`);
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it.each([
    ['empty changed files', ''],
    ['quality gate script change', 'scripts/quality/quality-gate-target.sh'],
    ['script bucket root change', 'scripts/demo/export-demo-pack.mjs'],
    ['bucket selector change', 'scripts/script-test-bucket-selection.mjs']
  ])('keeps shared quality script self-tests for %s', async (_label, changedFiles) => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-shared-segments-'));
    try {
      await writePackageJson(tempRoot);

      const result = await runTargetGate(tempRoot, 'shared', { QUALITY_GATE_CHANGED_FILES: changedFiles });

      expect(result.code).toBe(0);
      for (const step of QUALITY_SCRIPT_STEPS) {
        expectStep(result.stdout, step);
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

  it('keeps sequential and parallel quality script helpers on the same bucket set', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-shared-segments-'));
    try {
      await writePackageJson(tempRoot);

      const sequentialResult = await runTargetGate(tempRoot, 'shared-quality-tests');
      const parallelResult = await runTargetGate(tempRoot, 'release-tooling');

      expect(sequentialResult.code).toBe(0);
      expect(parallelResult.code).toBe(0);
      expect(parallelResult.stdout).toContain('running in parallel:');
      expect(extractQualityScriptSteps(sequentialResult.stdout)).toEqual(extractQualityScriptSteps(parallelResult.stdout));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);
});
