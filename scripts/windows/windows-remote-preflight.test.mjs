// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { runWindowsRemotePreflight } from './windows-remote-preflight.mjs';

const BASE = 'b'.repeat(40);
const TARGET = 'c'.repeat(40);
const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function write(file, text = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const BLOB = 'e'.repeat(40);

function extractBundle(root) {
  write(path.join(root, 'manifest.json'), JSON.stringify({ files: [{ file: 'one.tgz' }, { file: 'two.tgz' }],
    lockBlob: BLOB, schemaVersion: 1 }));
}

function setup({ bundle = true, dirty = false, headers = true, holders = [], override = () => null } = {}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-remote-preflight-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-remote-preflight-home-'));
  roots.push(repoRoot, home);
  write(path.join(repoRoot, 'package-lock.json'), '{"lock":1}');
  write(path.join(repoRoot, 'node_modules', '.package-lock.json'), '{}');
  write(path.join(repoRoot, 'node_modules', 'electron', 'package.json'), '{"version":"41.0.0"}');
  if (headers) {
    for (const file of ['installVersion', 'include/node/common.gypi', 'x64/node.lib']) {
      write(path.join(home, '.electron-gyp', '41.0.0', file), '11');
    }
  }
  if (bundle) write(path.join(repoRoot, '.tmp', 'artifacts', `windows-npm-bundle-${BLOB}.tar`));
  const commands = [];
  const execute = vi.fn(async (command, args) => {
    commands.push([command, ...args]);
    const overridden = override(command, args);
    if (overridden) return overridden;
    if (command === 'powershell.exe') return { code: 0, stdout: JSON.stringify(holders) };
    if (command === 'tar') {
      extractBundle(args[3]);
      return { code: 0, output: '' };
    }
    if (command !== 'git') return { code: 0, output: 'installed\n' };
    if (args[0] === 'rev-parse') {
      return { code: 0, stdout: { HEAD: TARGET, 'HEAD:package-lock.json': BLOB }[args[1]] ?? 'd'.repeat(40) };
    }
    if (args[0] === 'status') return { code: 0, stdout: dirty ? ' M x' : '' };
    return { code: 0, stdout: '' };
  });
  const plan = vi.fn(async () => ({ cap: 120, changedFiles: ['x.mjs'], deferred: [{ file: 'z.test.mjs' }],
    entries: [], run: [{ file: 'a.test.mjs' }, { file: 'b.test.mjs' }] }));
  const paths = { gitPath: 'git', repoRoot, systemNode: 'node', systemNpmCli: 'npm-cli.js', tarPath: 'tar' };
  return { commands, execute, home, paths, plan, repoRoot };
}

const run = (fixture, overrides = {}) => runWindowsRemotePreflight({ base: BASE, execute: fixture.execute,
  home: fixture.home,
  id: () => 'abcdef123456', paths: fixture.paths, plan: fixture.plan,
  runTests: async () => {}, ...overrides });

it('runs the shared selection on the aligned target and records a passed receipt', async () => {
  const fixture = setup();
  const result = await run(fixture);
  expect(result.exitCode).toBe(0);
  expect(fixture.plan).toHaveBeenCalledWith(expect.objectContaining({
    base: BASE, head: TARGET, host: 'windows', revision: true
  }));
  const saved = JSON.parse(fs.readFileSync(result.receiptPath, 'utf8'));
  expect(saved).toMatchObject({ base: BASE, cap: 120, deferred: ['z.test.mjs'], resultStatus: 'passed',
    selected: ['a.test.mjs', 'b.test.mjs'], target: { revision: TARGET, tree: 'd'.repeat(40) } });
  expect(result.receiptPath).toBe(path.join(fixture.repoRoot, '.tmp', 'artifacts', 'windows-dev-action',
    saved.runId, 'remote-preflight', 'receipt.json'));
});

it('records failed test files from the vitest report', async () => {
  const fixture = setup();
  const runTests = async () => {
    fs.mkdirSync(path.join(fixture.repoRoot, '.tmp', 'vitest'), { recursive: true });
    fs.writeFileSync(path.join(fixture.repoRoot, '.tmp', 'vitest', 'related.json'), JSON.stringify({
      testResults: [{ message: 'expected 1', name: path.join(fixture.repoRoot, 'a.test.mjs'), status: 'failed' },
        { name: path.join(fixture.repoRoot, 'b.test.mjs'), status: 'passed' }]
    }));
    throw new Error('ordinary related tests failed');
  };
  const result = await run(fixture, { runTests });
  expect(result.exitCode).toBe(1);
  expect(result.receipt).toMatchObject({ resultStatus: 'failed', failure: {
    failedFiles: [{ file: 'a.test.mjs', message: 'expected 1' }], stage: 'tests' } });
});

it('refuses an invalid base or a dirty checkout without running tests', async () => {
  const runTests = vi.fn();
  const invalid = await run(setup(), { base: 'HEAD~1', runTests });
  expect(invalid.receipt).toMatchObject({ failure: { stage: 'request' }, resultStatus: 'error' });
  const dirty = await run(setup({ dirty: true }), { runTests });
  expect(dirty.exitCode).toBe(64);
  expect(dirty.receipt.failure.stage).toBe('source');
  expect(runTests).not.toHaveBeenCalled();
});

it('installs locked dependencies once and reuses them while the lock is unchanged', async () => {
  const fixture = setup();
  await run(fixture);
  const installs = () => fixture.commands.filter(([command]) => command === 'node').length;
  expect(installs()).toBe(4);
  await run(fixture);
  expect(installs()).toBe(4);
  fs.writeFileSync(path.join(fixture.repoRoot, 'package-lock.json'), '{"lock":2}');
  await run(fixture);
  expect(installs()).toBe(8);
  const args = fixture.commands.filter(([command]) => command === 'node').slice(0, 4).map((c) => c.slice(1));
  expect(args[0].slice(0, 4)).toEqual(['npm-cli.js', 'cache', 'add', '--offline']);
  expect(args[0].slice(4).map((file) => path.basename(file))).toEqual(['one.tgz', 'two.tgz']);
  expect(args[1]).toEqual(['npm-cli.js', 'ci', '--offline', '--ignore-scripts']);
  expect(args[2][0]).toMatch(/windows-electron-offline-prepare\.mjs$/u);
  expect(args[3]).toEqual(expect.arrayContaining(['exec', '--offline', 'electron-rebuild', '--build-from-source']));
  expect(fixture.commands.flat().some((arg) => String(arg).endsWith('install.js'))).toBe(false);
});

it('refuses to rebuild native modules when Electron headers would be downloaded', async () => {
  const fixture = setup({ headers: false });
  const result = await run(fixture);
  expect(result.receipt).toMatchObject({ failure: { stage: 'dependencies-native' }, resultStatus: 'error' });
  expect(result.receipt.failure.message).toContain('refusing to download');
  expect(fixture.commands.filter(([command]) => command === 'node')).toHaveLength(3);
});

it('stops before npm ci when repository processes may hold node_modules', async () => {
  const fixture = setup({ holders: [{ Name: 'java.exe', ProcessId: 42 }] });
  const result = await run(fixture);
  expect(result.receipt).toMatchObject({ failure: { stage: 'dependencies-occupied' }, resultStatus: 'error' });
  expect(result.receipt.failure.message).toContain('java.exe#42');
  expect(fixture.commands.some(([command]) => command === 'node')).toBe(false);
});

it('stops before npm ci when the Mac bundle for this lock is missing', async () => {
  const fixture = setup({ bundle: false });
  const result = await run(fixture);
  expect(result.receipt).toMatchObject({ failure: { stage: 'dependencies-bundle' }, resultStatus: 'error' });
  expect(result.receipt.failure.message).toContain(`lock ${BLOB} was not transferred`);
  expect(fixture.commands.some(([command]) => command === 'node')).toBe(false);
});

it('records exit codes and the output tail when a test step ends without a report', async () => {
  const crash = '\u001b[32m\u00b7\u001b[39m{"event":"timing_metric"}\n'
    + '[vitest-summary] child exited: code=3221225477 signal=none\n'
    + '[vitest-summary] report unavailable: .tmp/vitest/related-electron.json\n'
    + '[electron-sqlite-runner] child exited status=1 signal=null\n';
  const fixture = setup({ override: (command, args) => (args[0] === 'runner.mjs'
    ? { code: 1, output: crash } : null) });
  const runTests = async (files, runner) => {
    if (await runner('node', ['runner.mjs', 'summary.mjs', '.tmp/vitest/related-electron.json']) !== 0) {
      throw new Error('Electron ABI related tests failed');
    }
  };
  const result = await run(fixture, { runTests });
  expect(result.receipt.failure).toMatchObject({ failedFiles: [], steps: [{
    code: 1, report: '.tmp/vitest/related-electron.json', vitestExitCode: 3221225477, vitestExitHex: '0xC0000005'
  }] });
  expect(result.receipt.failure.steps[0].outputTail.at(-1))
    .toBe('[electron-sqlite-runner] child exited status=1 signal=null');
  const tail = result.receipt.failure.steps[0].outputTail.join('\n');
  expect(tail.includes('\u001b') || tail.includes('\u00b7')).toBe(false);
});

it('keeps the npm cause of a failed offline install in the receipt', async () => {
  const fixture = setup({ override: (command, args) => (args[1] !== 'ci' ? null : { code: 1, output: [
      'npm warn deprecated glob@7.2.3: old',
      "npm warn cleanup     [Error: EPERM: operation not permitted, rmdir 'D:\\C\\foliole\\node_modules\\x'] {",
      'npm error code ENOTCACHED',
      "npm error request to https://registry.example/zod/-/zod-4.6.7.tgz failed: cache mode is 'only-if-cached'",
      'npm error A complete log of this run can be found in: D:\\log'
  ].join('\n') }) });
  const result = await run(fixture);
  expect(result.receipt).toMatchObject({ failure: { stage: 'dependencies' }, resultStatus: 'error' });
  expect(result.receipt.failure.message).toMatch(/^dependencies exited 1: .*EPERM.*\| npm error code ENOTCACHED \| .*zod-4\.6\.7\.tgz/u);
  expect(result.receipt.failure.message).not.toContain('complete log');
  expect(result.receipt.failure.message).not.toContain('deprecated');
});
