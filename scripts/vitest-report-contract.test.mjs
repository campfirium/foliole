// @vitest-environment node
/* global console, process */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  collectFileTotals,
  validateExpectedTestFiles
} from './vitest-report-contract.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = path.join(REPO_ROOT, 'scripts', 'run-vitest-with-summary.mjs');

function result(name, status, assertionStatuses) {
  return {
    assertionResults: assertionStatuses.map((assertionStatus) => ({ status: assertionStatus })),
    name,
    status
  };
}

function expected(files) {
  return JSON.stringify(files);
}

function silenceContractDiagnostics(run) {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return run();
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

describe('vitest report contract', () => {
  it('counts files from file results instead of nested suites', () => {
    const report = {
      numPassedTestSuites: 6,
      numTotalTestSuites: 6,
      testResults: [
        result('src/One.test.ts', 'passed', ['passed']),
        result('src/Two.test.ts', 'passed', ['passed']),
        result('src/Three.test.ts', 'failed', ['failed'])
      ]
    };

    expect(collectFileTotals(report)).toEqual({ passed: 2, total: 3 });
  });

  it('rejects missing and unexpected collected files', () => {
    const valid = 'src/Valid.test.ts';
    const missing = 'src/Missing.test.ts';
    const unexpected = 'src/Unexpected.test.ts';
    const report = {
      testResults: [result(valid, 'passed', ['passed']), result(unexpected, 'passed', ['passed'])]
    };

    const accepted = silenceContractDiagnostics(() =>
      validateExpectedTestFiles(report, expected([valid, missing]))
    );

    expect(accepted).toBe(false);
  });

  it('rejects a collected file whose tests are all skipped', () => {
    const file = 'src/Skipped.test.ts';
    const report = { testResults: [result(file, 'passed', ['skipped'])] };

    const accepted = silenceContractDiagnostics(() =>
      validateExpectedTestFiles(report, expected([file]))
    );

    expect(accepted).toBe(false);
  });

  it.each(['passed', 'failed'])('recognizes a %s assertion as executed', (status) => {
    const file = `src/${status}.test.ts`;
    const report = { testResults: [result(file, status, [status])] };

    const accepted = silenceContractDiagnostics(() =>
      validateExpectedTestFiles(report, expected([file]))
    );

    expect(accepted).toBe(true);
  });

  it('does not add a contract when no explicit expectation is provided', () => {
    expect(validateExpectedTestFiles({ testResults: [] }, '')).toBe(true);
  });
});

describe('vitest summary child environment', () => {
  it('does not expose the explicit file contract to the Vitest child', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'vitest-contract-env-'));
    const requestedFile = path.join(tempRoot, 'src', 'Fixture.test.ts');
    const reportPath = path.join(tempRoot, '.tmp', 'report.json');
    const observedEnvPath = path.join(tempRoot, 'observed-env.txt');
    try {
      const packageDir = path.join(tempRoot, 'node_modules', 'vitest');
      await mkdir(packageDir, { recursive: true });
      await writeFile(
        path.join(packageDir, 'vitest.mjs'),
        [
          "import { mkdirSync, writeFileSync } from 'node:fs';",
          "import path from 'node:path';",
          `writeFileSync(${JSON.stringify(observedEnvPath)}, process.env.FOLIOLE_EXPECTED_TEST_FILES || 'absent');`,
          "const output = process.argv.find((arg) => arg.startsWith('--outputFile.json='));",
          "const reportPath = output.slice('--outputFile.json='.length);",
          "const file = process.argv.find((arg) => arg.endsWith('Fixture.test.ts'));",
          "mkdirSync(path.dirname(reportPath), { recursive: true });",
          "writeFileSync(reportPath, JSON.stringify({ numPassedTestSuites: 1, numTotalTestSuites: 1, numPassedTests: 1, numTotalTests: 1, testResults: [{ name: file, status: 'passed', assertionResults: [{ status: 'passed' }] }] }));"
        ].join('\n')
      );

      const code = await new Promise((resolve) => {
        const child = spawn(process.execPath, [RUNNER, reportPath, '--', requestedFile], {
          cwd: tempRoot,
          env: {
            ...process.env,
            FOLIOLE_EXPECTED_TEST_FILES: expected([requestedFile]),
            VITEST_BIN: ''
          },
          stdio: 'ignore'
        });
        child.on('close', (exitCode) => resolve(exitCode));
      });

      expect(code).toBe(0);
      expect(await readFile(observedEnvPath, 'utf8')).toBe('absent');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
