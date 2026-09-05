// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = path.join(REPO_ROOT, 'scripts', 'run-vitest-with-summary.mjs');
const NODE_RUNTIME = process.env.npm_node_execpath?.trim() || process.execPath;

function runSummary(tempRoot, reportPath, exitCode = 1, envOverrides = null, vitestArgs = ['src/Foo.test.ts']) {
  const vitestEnv =
    envOverrides ??
    {
      FAKE_VITEST_EXIT: String(exitCode),
      VITEST_BIN: NODE_RUNTIME
    };
  return new Promise((resolve) => {
    const child = spawn(NODE_RUNTIME, [RUNNER, reportPath, '--', ...vitestArgs], {
      cwd: tempRoot,
      env: {
        ...process.env,
        VITEST_SUMMARY_SLOW_LIMIT: '2',
        ...vitestEnv,
        NODE_OPTIONS: '',
        npm_config_node_options: '',
        npm_config_script_shell: ''
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

async function createFakeVitestPackage(tempRoot) {
  const packageDir = path.join(tempRoot, 'node_modules', 'vitest');
  const argsPath = path.join(tempRoot, 'vitest-args.json');
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    path.join(packageDir, 'vitest.mjs'),
    [
      "import { mkdirSync, writeFileSync } from 'node:fs';",
      "import path from 'node:path';",
      `writeFileSync(${JSON.stringify(argsPath)}, JSON.stringify(process.argv.slice(2)));`,
      "const outputArg = process.argv.find((arg) => arg.startsWith('--outputFile.json='));",
      "const reportPath = outputArg?.slice('--outputFile.json='.length);",
      "if (reportPath) {",
      "  mkdirSync(path.dirname(reportPath), { recursive: true });",
      "  writeFileSync(reportPath, JSON.stringify({ numPassedTestSuites: 3, numTotalTestSuites: 3, numPassedTests: 1, numTotalTests: 1, testResults: [{ name: 'src/Foo.test.ts', status: 'passed', assertionResults: [{ status: 'passed' }] }] }));",
      "}"
    ].join('\n')
  );
  return argsPath;
}

describe('run-vitest-with-summary', () => {
  it('does not report stale failures when Vitest exits without writing a report', async () => {
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
      expect(result.stdout).toContain(`[vitest-summary] report unavailable: ${reportPath}`);
      await expect(readFile(reportPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('uses the vitest package module entry before platform-specific bin shims', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'vitest-summary-module-'));
    const reportPath = path.join(tempRoot, '.tmp', 'vitest', 'summary.json');
    try {
      const argsPath = await createFakeVitestPackage(tempRoot);
      const result = await runSummary(tempRoot, reportPath, 0, {
        VITEST_BIN: '',
        VITEST_PLATFORM_FOR_TEST: 'win32',
        VITEST_SUMMARY_SLOW_LIMIT: '2'
      });

      expect(result.code).toBe(0);
      const args = JSON.parse(await readFile(argsPath, 'utf8'));
      expect(args[0]).toBe('run');
      expect(args).toContain('src/Foo.test.ts');
      expect(result.stdout).toContain('[vitest-summary] totals: files 1/1 passed, suites 3/3 passed, tests 1/1 passed');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('lets release gates tune the pool, workers, and file parallelism without changing package scripts', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'vitest-summary-tuning-'));
    const reportPath = path.join(tempRoot, '.tmp', 'vitest', 'summary.json');
    try {
      const argsPath = await createFakeVitestPackage(tempRoot);
      const result = await runSummary(
        tempRoot,
        reportPath,
        0,
        {
          VITEST_BIN: '',
          VITEST_FILE_PARALLELISM: '1',
          VITEST_MAX_WORKERS: '4',
          VITEST_POOL: 'forks',
          VITEST_SUMMARY_SLOW_LIMIT: '2'
        },
        ['--pool=threads', '--maxWorkers=2', '--no-file-parallelism', 'src/Foo.test.ts']
      );

      expect(result.code).toBe(0);
      const args = JSON.parse(await readFile(argsPath, 'utf8'));
      expect(args).toContain('--pool=forks');
      expect(args).not.toContain('--pool=threads');
      expect(args).toContain('--maxWorkers=4');
      expect(args).not.toContain('--maxWorkers=2');
      expect(args).not.toContain('--no-file-parallelism');
      expect(args).toContain('src/Foo.test.ts');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
