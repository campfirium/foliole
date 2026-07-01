// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './quality-gate-fast.test-support.mjs';

const PROCESS_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-process.sh');

function runWaitFallbackProbe(tempRoot) {
  const outputFile = path.join(tempRoot, 'command.log').replaceAll('\\', '/');
  const script = [
    `source "${PROCESS_SCRIPT.replaceAll('\\', '/')}"`,
    'resolve_quality_gate_heartbeat_seconds() { printf "1"; }',
    'wait() { return 127; }',
    `run_command_with_limits "quality-gate-test" "${outputFile}" 0 0 "wait fallback" bash -lc "printf probe-ok"`,
    'printf "exit=%s\\n" "$?"',
    `printf "log=%s\\n" "$(cat "${outputFile}")"`
  ].join('\n');

  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', script], { cwd: REPO_ROOT });
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

describe('quality gate process wait status fallback', () => {
  it('uses the command status file when wait reports 127 after command completion', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-wait-status-'));
    try {
      const result = await runWaitFallbackProbe(tempRoot);

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('exit=0');
      expect(result.stdout).toContain('log=probe-ok');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
