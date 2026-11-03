// @vitest-environment node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { afterAll, expect, it } from 'vitest';

const artifacts = path.resolve('.tmp/artifacts/windows-preflight-adapter');
fs.mkdirSync(artifacts, { recursive: true });
const root = fs.mkdtempSync(path.join(artifacts, 'public-'));
fs.cpSync('scripts', path.join(root, 'scripts'), {
  recursive: true,
  filter: source => path.resolve(source) !== path.resolve('scripts/windows')
});
for (const directory of ['src', 'lib']) {
  fs.cpSync(directory, path.join(root, directory), { recursive: true });
}
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function run(adapterSource) {
  const adapter = path.join(root, 'machine.mjs');
  if (adapterSource) fs.writeFileSync(adapter, adapterSource);
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import './scripts/quality/remote-quality.mjs';
    import { runWindowsRemoteQualityPreflight as run } from './scripts/quality/remote-quality-preflight-windows.mjs';
    try {
      const result = await run({ cwd: process.cwd(), head: 'c'.repeat(40), base: 'b'.repeat(40),
        log: () => {}, verifyPushed: () => {},
        plan: async () => ({ changedFiles: ['a.mjs'], entries: ['a'], deferred: [], run: [{ file: 'a.test.mjs' }] }) });
      console.log(JSON.stringify(result));
    } catch (error) { console.log(JSON.stringify({ error: error.message })); }
  `], { cwd: root, encoding: 'utf8', env: {
    ...process.env, FOLIOLE_WINDOWS_PREFLIGHT_ADAPTER: adapterSource ? adapter : ''
  } });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

it('loads public preflight without personal Windows scripts and requires explicit configuration', () => {
  expect(run()).toEqual({ error: expect.stringContaining('FOLIOLE_WINDOWS_PREFLIGHT_ADAPTER') });
});

it('passes the exact action to the configured machine and accepts its matching receipt', () => {
  const result = run(`export function createWindowsPreflightControl({ cwd }) {
    return async argv => {
      if (argv.join(' ') !== 'remote-preflight --revision ' + 'c'.repeat(40) + ' --preflight-base ' + 'b'.repeat(40)) throw Error('wrong action');
      if (cwd !== process.cwd()) throw Error('wrong checkout');
      return { receiptPath: 'receipt.json', receipt: { base: 'b'.repeat(40), cap: 120,
        target: { revision: 'c'.repeat(40) }, resultStatus: 'passed', selected: ['a.test.mjs'] } };
    };
  }`);
  expect(result).toMatchObject({ host: 'windows', receiptPath: 'receipt.json' });
});

it('reports adapter failures without choosing another machine or host', () => {
  expect(run(`export function createWindowsPreflightControl() {
    return async () => { throw Error('machine unavailable'); };
  }`)).toEqual({ error: 'machine unavailable' });
});

it('rejects an adapter receipt for another revision', () => {
  expect(run(`export function createWindowsPreflightControl() {
    return async () => ({ receipt: { target: { revision: 'e'.repeat(40) } } });
  }`)).toEqual({ error: expect.stringContaining('not the dispatch target') });
});

it('rejects an invalid adapter export or control function', () => {
  expect(run('export const unrelated = true;'))
    .toEqual({ error: 'Windows preflight adapter must export createWindowsPreflightControl' });
  expect(run('export function createWindowsPreflightControl() { return null; }'))
    .toEqual({ error: 'Windows preflight adapter must return a control function' });
});
