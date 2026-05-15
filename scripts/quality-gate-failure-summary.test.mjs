// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
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

describe('quality gate failure summary', () => {
  it('prefers vitest json reports when recording failed test files', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-failure-summary-'));
    const failedSummary = path.join(tempRoot, 'logs', 'test-run', 'failed.txt');
    try {
      await mkdir(path.join(tempRoot, '.tmp', 'vitest'), { recursive: true });
      await writeFile(
        path.join(tempRoot, '.tmp', 'vitest', 'desktop.json'),
        JSON.stringify({
          testResults: [
            {
              name: 'src/app/JsonPreferred.test.tsx',
              status: 'failed',
              assertionResults: [{ status: 'failed' }]
            }
          ]
        })
      );

      const result = await runBash(
        [
          `source "${QUALITY_GATE_LIB}"`,
          'set +e',
          'run_quality_gate_command "quality-gate:test" "test:desktop" "test:desktop" bash -lc \'echo "FAIL src/app/LogOnly.test.tsx"; exit 1\'',
          'exit_code=$?',
          'set -e',
          'printf "exit=%s\\n" "$exit_code"'
        ].join('\n'),
        tempRoot,
        {
          QUALITY_GATE_LOG_ROOT: path.join(tempRoot, 'logs'),
          QUALITY_GATE_RUN_ID: 'test-run'
        }
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('src/app/JsonPreferred.test.tsx');
      const summary = await readFile(failedSummary, 'utf8');
      expect(summary).toContain('failed-test=src/app/JsonPreferred.test.tsx');
      expect(summary).not.toContain('failed-test=src/app/LogOnly.test.tsx');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
