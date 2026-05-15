// @vitest-environment node
/* global process */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUALITY_GATE_LIB = path.join(REPO_ROOT, 'scripts', 'quality-gate-lib.sh');

function runBash(script, cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', script], {
      cwd,
      env: { ...process.env, ...env }
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

describe('quality-gate-lib.sh', () => {
  it('reuses the same run directory for multiple log files in one shell session', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-lib-'));
    try {
      const result = await runBash(
        [
          `source "${QUALITY_GATE_LIB}"`,
          'first="$(create_quality_gate_log_file lint)"',
          'second="$(create_quality_gate_log_file test)"',
          'printf "%s\\n%s\\n" "$first" "$second"'
        ].join('\n'),
        tempRoot,
        {
          QUALITY_GATE_LOG_ROOT: tempRoot,
          QUALITY_GATE_RUN_ID: 'test-run'
        }
      );

      expect(result.code).toBe(0);
      const [firstLog, secondLog] = result.stdout.trim().split('\n');
      expect(path.dirname(firstLog)).toBe(path.dirname(secondLog));
      expect(firstLog).toContain(path.join(tempRoot, 'test-run'));
      expect(secondLog).toContain(path.join(tempRoot, 'test-run'));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps earlier step logs available after later step log creation', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-lib-'));
    try {
      const result = await runBash(
        [
          `source "${QUALITY_GATE_LIB}"`,
          'first="$(create_quality_gate_log_file lint)"',
          'printf "lint ok\\n" > "$first"',
          'second="$(create_quality_gate_log_file test)"',
          'printf "test ok\\n" > "$second"',
          'printf "%s\\n%s\\n" "$first" "$second"'
        ].join('\n'),
        tempRoot,
        {
          QUALITY_GATE_LOG_ROOT: tempRoot,
          QUALITY_GATE_RUN_ID: 'test-run'
        }
      );

      expect(result.code).toBe(0);
      const [firstLog, secondLog] = result.stdout.trim().split('\n');
      await expect(readFile(firstLog, 'utf8')).resolves.toContain('lint ok');
      await expect(readFile(secondLog, 'utf8')).resolves.toContain('test ok');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps ten quality gate runs by default', async () => {
    const result = await runBash(
      [`source "${QUALITY_GATE_LIB}"`, 'printf "%s\\n" "$(resolve_quality_gate_log_retention_runs)"'].join('\n'),
      REPO_ROOT
    );

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('10');
  });

  it('uses the temporary directory for default quality gate logs', async () => {
    const result = await runBash(
      [`source "${QUALITY_GATE_LIB}"`, 'printf "%s\\n" "$(resolve_quality_gate_log_root)"'].join('\n'),
      REPO_ROOT
    );

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(path.join(REPO_ROOT, '.tmp', 'logs', 'quality-gate'));
  });

  it('does not apply default outer timeouts to large test buckets', async () => {
    const result = await runBash(
      [
        `source "${QUALITY_GATE_LIB}"`,
        'printf "%s\\n" "$(resolve_quality_gate_limit android:sync timeout_seconds)"',
        'printf "%s\\n" "$(resolve_quality_gate_limit android:host:lint timeout_seconds)"',
        'printf "%s\\n" "$(resolve_quality_gate_limit android:host:test timeout_seconds)"',
        'printf "%s\\n" "$(resolve_quality_gate_limit android:host:device-test timeout_seconds)"',
        'printf "%s\\n" "$(resolve_quality_gate_limit check:android-boundary timeout_seconds)"',
        'printf "%s\\n" "$(resolve_quality_gate_limit test timeout_seconds)"',
        'printf "%s\\n" "$(resolve_quality_gate_limit test:desktop timeout_seconds)"',
        'printf "%s\\n" "$(resolve_quality_gate_limit test:android timeout_seconds)"',
        'printf "%s\\n" "$(resolve_quality_gate_limit test:shared timeout_seconds)"',
        'printf "%s\\n" "$(resolve_quality_gate_limit test:sync-pack timeout_seconds)"',
        'printf "%s\\n" "$(resolve_quality_gate_limit test:quality timeout_seconds)"',
        'printf "%s\\n" "$(resolve_quality_gate_limit test:full timeout_seconds)"'
      ].join('\n'),
      REPO_ROOT
    );

    expect(result.code).toBe(0);
    expect(result.stdout.trim().split('\n')).toEqual([
      '1200',
      '1200',
      '1200',
      '1800',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0'
    ]);
  });

  it('keeps explicit timeout overrides for android host tasks', async () => {
    const result = await runBash(
      [
        `source "${QUALITY_GATE_LIB}"`,
        'printf "%s\\n" "$(resolve_quality_gate_limit android:host:test timeout_seconds)"'
      ].join('\n'),
      REPO_ROOT,
      {
        QUALITY_GATE_ANDROID_HOST_TEST_TIMEOUT_SECONDS: '42'
      }
    );

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('42');
  });

  it('defaults quality gate output to fail-only mode', async () => {
    const result = await runBash(
      [`source "${QUALITY_GATE_LIB}"`, 'resolve_quality_gate_log_mode'].join('\n'),
      REPO_ROOT
    );

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('fail-only');
  });

  it('records failed tests and prints a targeted vitest rerun command', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-lib-'));
    const failedSummary = path.join(tempRoot, 'test-run', 'failed.txt');
    try {
      const result = await runBash(
        [
          `source "${QUALITY_GATE_LIB}"`,
          'set +e',
          'run_quality_gate_command "quality-gate:test" "test:desktop" "test:desktop" bash -lc \'echo "FAIL src/app/Foo.test.tsx"; exit 1\'',
          'exit_code=$?',
          'set -e',
          'printf "exit=%s\\n" "$exit_code"'
        ].join('\n'),
        tempRoot,
        {
          QUALITY_GATE_LOG_ROOT: tempRoot,
          QUALITY_GATE_RUN_ID: 'test-run'
        }
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('exit=1');
      expect(result.stdout).toContain(`failed summary: ${failedSummary}`);
      expect(result.stdout).toContain(
        'rerun: node scripts/run-vitest-with-summary.mjs .tmp/vitest/rerun.json -- --silent=passed-only --pool=threads --no-file-parallelism src/app/Foo.test.tsx'
      );
      await expect(readFile(failedSummary, 'utf8')).resolves.toContain('failed-test=src/app/Foo.test.tsx');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

});
