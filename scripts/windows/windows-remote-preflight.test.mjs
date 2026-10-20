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

function setup({ dirty = false, headers = true } = {}) {
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
  const commands = [];
  const execute = vi.fn(async (command, args) => {
    commands.push([command, ...args]);
    if (command !== 'git') return { code: 0, output: 'installed\n' };
    if (args[0] === 'rev-parse') return { code: 0, stdout: args[1] === 'HEAD' ? TARGET : 'd'.repeat(40) };
    if (args[0] === 'status') return { code: 0, stdout: dirty ? ' M x' : '' };
    return { code: 0, stdout: '' };
  });
  const plan = vi.fn(async () => ({ cap: 120, changedFiles: ['x.mjs'], deferred: [{ file: 'z.test.mjs' }],
    entries: [], run: [{ file: 'a.test.mjs' }, { file: 'b.test.mjs' }] }));
  const paths = { gitPath: 'git', repoRoot, systemNode: 'node', systemNpmCli: 'npm-cli.js' };
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
  expect(installs()).toBe(3);
  await run(fixture);
  expect(installs()).toBe(3);
  fs.writeFileSync(path.join(fixture.repoRoot, 'package-lock.json'), '{"lock":2}');
  await run(fixture);
  expect(installs()).toBe(6);
  const args = fixture.commands.filter(([command]) => command === 'node').slice(0, 3).map((c) => c.slice(1));
  expect(args[0]).toEqual(['npm-cli.js', 'ci', '--offline', '--ignore-scripts']);
  expect(args[1][0]).toMatch(/windows-electron-offline-prepare\.mjs$/u);
  expect(args[2]).toEqual(expect.arrayContaining(['exec', '--offline', 'electron-rebuild', '--build-from-source']));
  expect(fixture.commands.flat().some((arg) => String(arg).endsWith('install.js'))).toBe(false);
});

it('refuses to rebuild native modules when Electron headers would be downloaded', async () => {
  const fixture = setup({ headers: false });
  const result = await run(fixture);
  expect(result.receipt).toMatchObject({ failure: { stage: 'dependencies-native' }, resultStatus: 'error' });
  expect(result.receipt.failure.message).toContain('refusing to download');
  expect(fixture.commands.filter(([command]) => command === 'node')).toHaveLength(2);
});
