// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = path.join(REPO_ROOT, 'scripts', 'run-vitest-with-summary.mjs');

function runSummary(tempRoot, reportPath, exitCode = 1) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RUNNER, reportPath, '--', 'src/Foo.test.ts'], {
      cwd: tempRoot,
      env: {
        ...process.env,
        VITEST_BIN: process.execPath,
        VITEST_SUMMARY_SLOW_LIMIT: '2',
        NODE_OPTIONS: '',
        npm_config_node_options: '',
        npm_config_script_shell: '',
        FAKE_VITEST_EXIT: String(exitCode)
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

describe('run-vitest-with-summary', () => {
  it('prints failed tests and slow duration rankings from the json report', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'vitest-summary-'));
    const reportPath = path.join(tempRoot, '.tmp', 'vitest', 'summary.json');
    try {
      await mkdir(path.dirname(reportPath), { recursive: true });
      await writeFile(
        reportPath,
        JSON.stringify({
          numPassedTestSuites: 1,
          numTotalTestSuites: 2,
          numPassedTests: 2,
          numTotalTests: 3,
          testResults: [
            {
              name: 'src/Fast.test.ts',
              startTime: 10,
              endTime: 30,
              assertionResults: [{ fullName: 'fast test', status: 'passed', duration: 5 }]
            },
            {
              name: 'src/Slow.test.ts',
              startTime: 10,
              endTime: 610,
              assertionResults: [
                { fullName: 'slow pass', status: 'passed', duration: 500 },
                { fullName: 'slow fail', status: 'failed', duration: 250 }
              ]
            }
          ]
        })
      );

      const result = await runSummary(tempRoot, reportPath, 1);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[vitest-summary] failed tests: 1');
      expect(result.stdout).toContain('src/Slow.test.ts :: slow fail');
      expect(result.stdout).toContain('[vitest-summary] slowest files: top 2');
      expect(result.stdout).toContain('600ms src/Slow.test.ts');
      expect(result.stdout).toContain('[vitest-summary] slowest tests: top 2');
      expect(result.stdout).toContain('500ms src/Slow.test.ts :: slow pass');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
