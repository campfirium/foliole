// @vitest-environment node
/* global process */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
        REPO_ROOT,
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
        REPO_ROOT,
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
});
