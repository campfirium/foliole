// @vitest-environment node
/* global process */

import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'test-files.mjs');
const ABI_GUARD_TEST_TIMEOUT_MS = 15000;
const ORDINARY_NODE = process.versions.electron
  ? process.env.FOLIOLE_WINDOWS_NODE_EXE || 'node'
  : process.execPath;

function runTestFiles(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(ORDINARY_NODE, [SCRIPT, ...args], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        ...env,
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

async function createFakeVitest(tempRoot) {
  const argsPath = path.join(tempRoot, 'vitest-args.json');
  const fakeVitestPath = path.join(tempRoot, 'fake-vitest.mjs');
  const fakeVitestCommandPath = process.platform === 'win32' ? path.join(tempRoot, 'fake-vitest.cmd') : fakeVitestPath;
  await writeFile(
    fakeVitestPath,
    [
      '#!/usr/bin/env node',
      "import { mkdirSync, writeFileSync } from 'node:fs';",
      "import path from 'node:path';",
      `writeFileSync(${JSON.stringify(argsPath)}, JSON.stringify(process.argv.slice(2)));`,
      "const outputArg = process.argv.find((arg) => arg.startsWith('--outputFile.json='));",
      "const reportPath = outputArg?.slice('--outputFile.json='.length);",
      "if (reportPath) {",
      "  mkdirSync(path.dirname(reportPath), { recursive: true });",
      "  const requested = process.argv.slice(2).filter((arg) => /\\.test\\.(mjs|ts|tsx)$/.test(arg));",
      "  const collected = process.env.FAKE_COLLECT_NO_FILES === '1' ? [] : requested;",
      "  writeFileSync(reportPath, JSON.stringify({ numPassedTestSuites: 2, numTotalTestSuites: 2, numPassedTests: 1, numTotalTests: 1, testResults: collected.map((name) => ({ name, status: 'passed', assertionResults: [{ status: 'passed' }] })) }));",
      "}"
    ].join('\n')
  );
  await chmod(fakeVitestPath, 0o755);
  if (process.platform === 'win32') {
    await writeFile(fakeVitestCommandPath, `@echo off\r\n"${ORDINARY_NODE}" "${fakeVitestPath}" %*\r\n`, 'utf8');
  }
  return { argsPath, fakeVitestPath: fakeVitestCommandPath };
}

describe('test-files', () => {
  it('rejects missing files', async () => {
    const result = await runTestFiles([]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Usage: npm run test:files');
  });

  it('rejects directory arguments', async () => {
    const result = await runTestFiles(['src/app']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('expected test file');
  });

  it('rejects a missing file before starting Vitest even when another file is valid', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'test-files-missing-'));
    try {
      const { argsPath, fakeVitestPath } = await createFakeVitest(tempRoot);
      const result = await runTestFiles(['src/app/pdfReaderLazyBoundary.test.ts', 'src/app/missing.test.ts'], {
        VITEST_BIN: fakeVitestPath
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('src/app/missing.test.ts');
      await expect(readFile(argsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails when Vitest does not collect an explicitly requested existing file', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'test-files-uncollected-'));
    try {
      const { fakeVitestPath } = await createFakeVitest(tempRoot);
      const result = await runTestFiles(['src/app/pdfReaderLazyBoundary.test.ts'], {
        FAKE_COLLECT_NO_FILES: '1',
        VITEST_BIN: fakeVitestPath
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('requested file not collected');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('runs only explicit test file arguments through the vitest summary runner', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'test-files-'));
    try {
      await mkdir(path.join(tempRoot, 'nested'), { recursive: true });
      const { argsPath, fakeVitestPath } = await createFakeVitest(tempRoot);
      const result = await runTestFiles(['src\\app\\components\\WorkspaceTopicTreeRows.test.tsx'], {
        VITEST_BIN: fakeVitestPath
      });

      expect(result.code).toBe(0);
      const vitestArgs = JSON.parse(await readFile(argsPath, 'utf8'));
      expect(vitestArgs).toContain('src/app/components/WorkspaceTopicTreeRows.test.tsx');
      expect(vitestArgs).not.toContain('src\\app\\components\\WorkspaceTopicTreeRows.test.tsx');
      expect(vitestArgs).toContain('--pool=threads');
      expect(vitestArgs).toContain(`--maxWorkers=${process.env.VITEST_MAX_WORKERS?.trim() || '2'}`);
      if (process.env.VITEST_FILE_PARALLELISM?.trim() === '1' || process.env.VITEST_FILE_PARALLELISM?.trim() === 'true') {
        expect(vitestArgs).not.toContain('--no-file-parallelism');
      } else {
        expect(vitestArgs).toContain('--no-file-parallelism');
      }
      expect(vitestArgs).not.toContain('src/app');
      expect(result.stdout).toContain('[vitest-summary] totals: files 1/1 passed, suites 2/2 passed, tests 1/1 passed');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('allows native test callers to select process isolation explicitly', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'test-files-forks-'));
    try {
      const { argsPath, fakeVitestPath } = await createFakeVitest(tempRoot);
      const result = await runTestFiles(['src/app/pdfReaderLazyBoundary.test.ts'], {
        VITEST_BIN: fakeVitestPath,
        VITEST_POOL: 'forks'
      });

      expect(result.code).toBe(0);
      const vitestArgs = JSON.parse(await readFile(argsPath, 'utf8'));
      expect(vitestArgs).toContain('--pool=forks');
      expect(vitestArgs).not.toContain('--pool=threads');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('refuses real sqlite tests outside the Electron ABI runner', async () => {
    const result = await runTestFiles(['src/shared/platform/companionSyncStateObjects.test.ts']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('real sqlite tests cannot run under the ordinary Node ABI');
    expect(result.stderr).toContain('npm run test:sqlite:electron');
  }, ABI_GUARD_TEST_TIMEOUT_MS);

  it('refuses indirect database connection tests outside the Electron ABI runner', async () => {
    const result = await runTestFiles(['electron/database/externalDocumentImportVisibility.test.ts']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('real sqlite tests cannot run under the ordinary Node ABI');
    expect(result.stderr).toContain('electron/database/externalDocumentImportVisibility.test.ts');
  }, ABI_GUARD_TEST_TIMEOUT_MS);

  it('refuses spoofed Electron-as-Node environment under the ordinary Node ABI', async () => {
    const result = await runTestFiles(['src/shared/platform/companionSyncStateObjects.test.ts'], {
      ELECTRON_RUN_AS_NODE: '1'
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('real sqlite tests cannot run under the ordinary Node ABI');
  }, ABI_GUARD_TEST_TIMEOUT_MS);
});
