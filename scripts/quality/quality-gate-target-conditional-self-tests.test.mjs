// @vitest-environment node
/* global process */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { QUALITY_SCRIPT_STEPS, expectStep } from './quality-gate-target-test-support.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-target.sh');
const DRY_RUN_ENV = { QUALITY_GATE_TEST_CONTEXT: '1', QUALITY_GATE_TEST_DRY_RUN_STEPS: '1' };
const HOSTED_ENV = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' };
const ok = (message) => `node -e "console.log('${message}')"`;

function runTargetGate(cwd, target, changedFiles) {
  return new Promise((resolve) => {
    const child = spawn('bash', [TARGET_SCRIPT, target], {
      cwd,
      env: {
        ...process.env,
        ...HOSTED_ENV,
        QUALITY_GATE_CHANGED_FILES: changedFiles,
        QUALITY_GATE_LOG_MODE: 'summary',
        ...DRY_RUN_ENV
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
    'lint:android:full': ok('android lint ok'),
    'lint:desktop:full': ok('desktop lint ok'),
    'typecheck:android': ok('android typecheck ok'),
    'typecheck:desktop': ok('desktop typecheck ok'),
    'test:android': ok('android test ok'),
    'test:desktop': ok('desktop test ok'),
    'test:windows:core': ok('windows core ok'),
    'android:sync': ok('android sync ok'),
    'android:host:lint': ok('android host lint ok'),
    'android:host:test': ok('android host test ok'),
    build: ok('build ok'),
    'electron:compile': ok('electron compile ok')
  };
  for (const step of QUALITY_SCRIPT_STEPS) {
    scripts[step] = ok(`${step} ok`);
  }
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name: 'quality-gate-conditional-fixture', private: true, scripts }, null, 2)}\n`,
    'utf8'
  );
}

describe('quality-gate-target.sh conditional quality self-tests', () => {
  it.each([
    ['desktop', ['lint:desktop:full', 'typecheck:desktop', 'test:desktop', 'test:windows:core', 'build', 'electron:compile']],
    ['android', ['check:android-boundary', 'lint:android:full', 'typecheck:android', 'test:android', 'android:sync', 'android:host:lint', 'android:host:test']]
  ])('skips quality script self-tests for ordinary %s product changes', async (target, expectedSteps) => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-conditional-'));
    try {
      await writePackageJson(tempRoot);

      const result = await runTargetGate(tempRoot, target, 'src/app/example.ts');

      expect(result.code).toBe(0);
      for (const step of expectedSteps) {
        expectStep(result.stdout, step);
      }
      expect(result.stdout).toContain('skipped quality script self-tests');
      for (const step of QUALITY_SCRIPT_STEPS) {
        expect(result.stdout).not.toContain(`dry-run step: ${step}`);
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);
});
