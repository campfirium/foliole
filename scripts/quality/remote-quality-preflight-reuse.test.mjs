// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runRemoteQualityPreflight } from './remote-quality-preflight.mjs';
import { digestConfigFiles, readPreflightRecord, workingTreeHash } from './remote-quality-preflight-reuse.mjs';

const TEST_A = 'scripts/quality/a-remote.test.mjs';
const TEST_B = 'scripts/quality/b-remote.test.mjs';
const SOURCES = { [TEST_A]: "import './remote-alpha.mjs';", [TEST_B]: "import './remote-alpha.mjs';" };
const PRINT = {
  configDigest: 'config-1', environment: { arch: 'arm64', electron: '38.0.0', node: 'v24.0.0', platform: 'darwin' },
  tree: 'tree-1'
};

let directory;
let recordFile;

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'remote-preflight-reuse-'));
  recordFile = path.join(directory, 'record.json');
});
afterEach(() => rmSync(directory, { force: true, recursive: true }));

function runner(tests = Object.keys(SOURCES)) {
  return vi.fn(async (_command, args) => ({ code: 0, stderr: '',
    stdout: args[0] === 'diff' ? 'scripts/quality/remote-alpha.mjs\n' : tests.join('\n') }));
}

async function preflight({ fingerprint = PRINT, tests } = {}) {
  const runTests = vi.fn(async () => {});
  const result = await runRemoteQualityPreflight({ base: 'a'.repeat(40), fingerprint: () => fingerprint,
    log: () => {}, readText: (file) => SOURCES[file], recordFile, runTests, runner: runner(tests) });
  return { result, runTests };
}

describe('remote quality preflight reuse', () => {
  it('records the executed set and skips the tests when every condition still holds', async () => {
    expect((await preflight()).runTests).toHaveBeenCalledOnce();
    expect(readPreflightRecord(recordFile)).toMatchObject({ ...PRINT, files: [TEST_A, TEST_B] });
    const second = await preflight({ tests: [TEST_A] });
    expect(second.runTests).not.toHaveBeenCalled();
    expect(second.result.reused).toBe(true);
  });

  it.each([
    ['the source tree', { fingerprint: { ...PRINT, tree: 'tree-2' } }],
    ['the config or dependency lock', { fingerprint: { ...PRINT, configDigest: 'config-2' } }],
    ['the Node version', { fingerprint: { ...PRINT, environment: { ...PRINT.environment, node: 'v25.0.0' } } }],
    ['the Electron version', { fingerprint: { ...PRINT, environment: { ...PRINT.environment, electron: '39.0.0' } } }],
    ['the platform', { fingerprint: { ...PRINT, environment: { ...PRINT.environment, platform: 'win32' } } }],
    ['an unavailable fingerprint', { fingerprint: null }]
  ])('reruns the tests when %s differs', async (_label, next) => {
    await preflight();
    expect((await preflight(next)).runTests).toHaveBeenCalledOnce();
  });

  it('reruns the tests when the selection is not a subset of the record', async () => {
    await preflight({ tests: [TEST_A] });
    expect((await preflight()).runTests).toHaveBeenCalledWith([TEST_A, TEST_B]);
  });

  it.each([['missing', null], ['corrupt', '{not json'], ['wrong shape', JSON.stringify({ ...PRINT })]])(
    'treats a %s record as unmet', async (_label, content) => {
      if (content !== null) writeFileSync(recordFile, content);
      expect((await preflight()).runTests).toHaveBeenCalledOnce();
    }
  );

  it('does not record a pass when the tree moved during the run', async () => {
    const prints = [PRINT, { ...PRINT, tree: 'tree-2' }];
    await runRemoteQualityPreflight({ base: 'a'.repeat(40), fingerprint: () => prints.shift(), log: () => {},
      readText: (file) => SOURCES[file], recordFile, runTests: async () => {}, runner: runner() });
    expect(readPreflightRecord(recordFile)).toBeNull();
  });

  it('digests config contents and marks missing files', () => {
    writeFileSync(path.join(directory, 'package-lock.json'), '{"v":1}');
    const first = digestConfigFiles(directory, ['package-lock.json', 'vite.config.ts']);
    writeFileSync(path.join(directory, 'package-lock.json'), '{"v":2}');
    expect(digestConfigFiles(directory, ['package-lock.json', 'vite.config.ts'])).not.toBe(first);
  });

  it('hashes uncommitted and untracked work without touching the real index', () => {
    const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
    git('init', '-q');
    writeFileSync(path.join(directory, 'a.txt'), 'one');
    git('add', 'a.txt');
    const indexed = git('write-tree');
    expect(workingTreeHash(directory)).toBe(indexed);
    writeFileSync(path.join(directory, 'b.txt'), 'two');
    expect(workingTreeHash(directory)).not.toBe(indexed);
    expect(git('write-tree')).toBe(indexed);
    expect(readFileSync(path.join(directory, 'a.txt'), 'utf8')).toBe('one');
  });
});
