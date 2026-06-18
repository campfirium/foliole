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

  it('accelerates release gates by default', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-release-target-'));
    try {
      await writePackageJson(tempRoot, {
        ...releaseScripts(),
        'quality:ios':
          'node -e "console.log(\'workers=\' + process.env.VITEST_MAX_WORKERS + \';file=\' + process.env.VITEST_FILE_PARALLELISM + \';jobs=\' + process.env.QUALITY_GATE_PARALLEL_MAX_JOBS)"'
      });

      const result = await runTargetGate(tempRoot, 'release-ios-tail');

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('workers=4;file=1;jobs=4');
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
