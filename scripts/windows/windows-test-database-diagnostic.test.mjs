// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { parseWindowsDevControlArgs } from './windows-dev-control.mjs';
import { runWindowsTestDatabaseDiagnostic, TEST_DATABASE_DIAGNOSTIC_FILE } from './windows-test-database-diagnostic.mjs';
import { runWindowsTestDatabaseDiagnosticControl } from './windows-test-database-diagnostic-control.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function root() {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'test-database-diagnostic-'));
  roots.push(value);
  return value;
}

it('accepts only the fixed diagnostic action without caller-supplied commands', () => {
  expect(parseWindowsDevControlArgs(['test-database-cleanup'], {}).action).toBe('test-database-cleanup');
  expect(() => parseWindowsDevControlArgs(['test-database-cleanup', '--file', 'other.test.ts'], {})).toThrow();
});

it.each([0, 1])('runs the original file under Electron ABI and retains lifecycle evidence on exit %s', async code => {
  const repoRoot = root();
  const execute = vi.fn(async (_command, args, options) => {
    if (args[0] === 'rev-parse') return { code: 0, stdout: 'a'.repeat(40) };
    fs.appendFileSync(options.env.FOLIOLE_TEST_DB_LIFECYCLE_LOG, '{"event":"after-close","open":false}\n');
    return { code, output: code ? 'EBUSY fixture cleanup' : '10 tests passed' };
  });
  const result = await runWindowsTestDatabaseDiagnostic({ paths: {
    repoRoot, gitPath: 'git', systemNode: 'system-node', systemNpmCli: 'npm-cli'
  }, execute, prepare: async () => ({ output: '', installed: false, lockSha256: 'lock' }) });
  expect(execute.mock.calls[1][1]).toEqual(['npm-cli', 'run', 'test:sqlite:electron', '--', TEST_DATABASE_DIAGNOSTIC_FILE]);
  expect(result.receipt).toMatchObject({ revision: 'a'.repeat(40), lifecycleEvents: 1,
    resultStatus: code ? 'failed' : 'passed' });
  expect(result.exitCode).toBe(code);
  expect(fs.readFileSync(path.join(path.dirname(result.receiptPath), 'action.log'), 'utf8'))
    .toContain(code ? 'EBUSY' : '10 tests passed');
});

it('does not report success when the lifecycle probe emitted nothing', async () => {
  const result = await runWindowsTestDatabaseDiagnostic({ paths: {
    repoRoot: root(), gitPath: 'git', systemNode: 'node', systemNpmCli: 'npm'
  }, execute: async () => ({ code: 0, stdout: 'a'.repeat(40), output: '' }),
  prepare: async () => ({ output: '' }) });
  expect(result.receipt.resultStatus).toBe('error');
  expect(result.receipt.failure).toContain('no evidence');
});

it('copies the fixed receipt and connection evidence even when the Windows test fails', async () => {
  const repoRoot = root();
  const remoteRoot = 'D:/C/foliole/.tmp/artifacts/windows-dev-action/run-1/test-database-cleanup';
  const remoteError = Object.assign(new Error('test failed'), {
    output: `[windows-dev-action] test-database-cleanup identity=run-1 receipt=${remoteRoot}/receipt.json\n`
  });
  const executeScp = vi.fn(async ([remote, local]) => {
    fs.writeFileSync(local, remote.endsWith('receipt.json')
      ? JSON.stringify({ action: 'test-database-cleanup', runId: 'run-1' }) : 'evidence');
  });
  await expect(runWindowsTestDatabaseDiagnosticControl({ env: {}, executeGit: vi.fn(),
    executeScp, executeSsh: async () => { throw remoteError; }, fsApi: fs, host: 'user@host',
    prepareRuntime: vi.fn(), pushSpec: () => ({ args: [], env: {} }), repoRoot,
    scpSpec: (_host, remote, local) => [remote, local], sshSpec: () => [], stdout: { write: vi.fn() }
  })).rejects.toMatchObject({ evidenceRoot: path.join(repoRoot, '.tmp/artifacts/T504/windows/run-1') });
  expect(executeScp.mock.calls.map(([args]) => path.basename(args[1])))
    .toEqual(['receipt.json', 'action.log', 'connections.jsonl']);
});
