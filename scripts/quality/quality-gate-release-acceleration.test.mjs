// @vitest-environment node
/* global process */

import { spawn } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './quality-gate-fast.test-support.mjs';

const PARALLEL_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-target-parallel.sh');

function readReleaseAccelerationEnv(env = {}) {
  const script = [
    'unset QUALITY_GATE_PARALLEL_MAX_JOBS',
    'unset VITEST_FILE_PARALLELISM',
    'unset VITEST_MAX_WORKERS',
    'source "$QUALITY_GATE_PARALLEL_SCRIPT"',
    'apply_release_gate_acceleration_defaults',
    'printf "QUALITY_GATE_PARALLEL_MAX_JOBS=%s\\n" "${QUALITY_GATE_PARALLEL_MAX_JOBS-unset}"',
    'printf "VITEST_FILE_PARALLELISM=%s\\n" "${VITEST_FILE_PARALLELISM-unset}"',
    'printf "VITEST_MAX_WORKERS=%s\\n" "${VITEST_MAX_WORKERS-unset}"'
  ].join('\n');

  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', script], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        ...env,
        QUALITY_GATE_PARALLEL_SCRIPT: PARALLEL_SCRIPT
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
      resolve({ code, stderr, stdout });
    });
  });
}

describe('quality gate release acceleration defaults', () => {
  it('keeps bucket-level parallelism without injecting Vitest worker overrides', async () => {
    const result = await readReleaseAccelerationEnv();

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('QUALITY_GATE_PARALLEL_MAX_JOBS=4');
    expect(result.stdout).toContain('VITEST_FILE_PARALLELISM=unset');
    expect(result.stdout).toContain('VITEST_MAX_WORKERS=unset');
  });
});
