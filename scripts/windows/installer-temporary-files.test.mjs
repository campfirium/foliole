// @vitest-environment node

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { afterEach, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve('electron-builder'));
const appBuilderRequire = createRequire(builderRequire.resolve('app-builder-lib'));
const squirrelRequire = createRequire(appBuilderRequire.resolve('electron-builder-squirrel-windows'));
const installerRequire = createRequire(squirrelRequire.resolve('electron-winstaller'));
const installerTemp = installerRequire('./temp-utils.js');
const temp = installerTemp;
const { rimraf, glob } = installerTemp;
const roots = [];

function fixture() {
  const parent = path.resolve('.tmp/artifacts/installer-temporary-tests');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'run-'));
  roots.push(root);
  return root;
}

function write(root, name) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, name);
}

afterEach(() => {
  temp.cleanupSync();
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

it('matches installer cleanup patterns through the actual installer dependency', async () => {
  const cwd = fixture();
  for (const name of ['one.txt', 'two.log', 'nested/three.txt', 'nested/.hidden.txt',
    'ignored/four.txt', 'literal[1].txt']) write(cwd, name);
  const cases = [
    ['**/*.{txt,log}', { ignore: 'ignored/**' },
      ['literal[1].txt', path.join('nested', 'three.txt'), 'one.txt', 'two.log']],
    ['nested/**/*.txt', { dot: true }, [path.join('nested', '.hidden.txt'), path.join('nested', 'three.txt')]],
    ['missing{1,2}.txt', { nonull: true }, ['missing1.txt', 'missing2.txt']],
    ['missing{1,2}.txt', { nonull: true, nobrace: true }, ['missing{1,2}.txt']],
    ['nested/{three,missing}.txt', { nonull: true }, ['nested/missing.txt', path.join('nested', 'three.txt')]],
    ['literal[[]1].txt', {}, ['literal[1].txt']],
    // Legacy glob treats backslashes as separators on Windows and escapes on macOS.
    ['literal\\[1\\].txt', {}, process.platform === 'win32' ? [] : ['literal[1].txt']]
  ];
  for (const [pattern, options, expected] of cases) {
    expect(glob.sync(pattern, { cwd, nodir: true, ...options }).sort()).toEqual(expected);
    expect((await promisify(glob)(pattern, { cwd, nodir: true, ...options })).sort())
      .toEqual(expected);
  }
});

it.each(['sync', 'async'])('removes installer temporary trees and preserves siblings: %s', async mode => {
  const root = fixture();
  const temporary = await installerTemp.createTempDir({ dir: root, prefix: 'installer [1] ' });
  write(temporary, 'nested/payload.txt');
  write(temporary, 'nested/.hidden');
  write(root, 'keep.txt');
  if (mode === 'sync') temp.cleanupSync();
  else await temp.cleanup();
  expect(fs.existsSync(temporary)).toBe(false);
  expect(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8')).toBe('keep.txt');
});

it.each(['sync', 'async'])('cleans wildcard temporary outputs through rimraf and glob: %s', async mode => {
  const root = fixture();
  write(root, 'nested/remove.tmp');
  write(root, 'other/remove.tmp');
  write(root, 'nested/keep.txt');
  const pattern = `${root.replaceAll('\\', '/')}/**/*.tmp`;
  if (mode === 'sync') rimraf.sync(pattern);
  else await promisify(rimraf)(pattern);
  expect(fs.existsSync(path.join(root, 'nested/remove.tmp'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'other/remove.tmp'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'nested/keep.txt'))).toBe(true);
});

it.each(['sync', 'async'])('preserves a matching sibling when a tracked directory disappears: %s', async mode => {
  const root = fixture();
  const temporary = await installerTemp.createTempDir({ dir: root, prefix: 'installer [12] ' });
  const sibling = temporary.replace('[12]', '1');
  write(sibling, 'keep.txt');
  fs.rmSync(temporary, { recursive: true });
  if (mode === 'sync') temp.cleanupSync();
  else await temp.cleanup();
  expect(fs.readFileSync(path.join(sibling, 'keep.txt'), 'utf8')).toBe('keep.txt');
});

it('cleans through the callback API and keeps a symlink destination intact', async () => {
  const root = fixture();
  const temporary = await installerTemp.createTempDir({ dir: root, prefix: 'installer [1] ' });
  const sibling = path.join(root, 'sibling');
  write(sibling, 'keep.txt');
  fs.symlinkSync(sibling, path.join(temporary, 'linked'), 'junction');
  const result = await promisify(temp.cleanup)();
  expect(result.dirs).toBe(1);
  expect(fs.existsSync(temporary)).toBe(false);
  expect(fs.readFileSync(path.join(sibling, 'keep.txt'), 'utf8')).toBe('keep.txt');
  expect(await temp.cleanup()).toEqual({ files: 0, dirs: 0 });
});

it('cleans real installer string prefixes on normal process exit', () => {
  const helper = installerRequire.resolve('./temp-utils.js');
  const source = `
    const fs = require('node:fs');
    const temporary = require(process.argv[1]);
    temporary.createTempDir('si-[12]-').then(directory => {
      fs.writeFileSync(require('node:path').join(directory, '.payload'), 'payload');
      process.stdout.write(JSON.stringify(directory));
    }).catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ['-e', source, helper], {
    encoding: 'utf8', timeout: 10000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });
  expect({ status: result.status, error: result.error?.message, stderr: result.stderr })
    .toEqual({ status: 0, error: undefined, stderr: '' });
  const directory = JSON.parse(result.stdout);
  expect(path.basename(directory)).toMatch(/^si-\[12\]-/);
  expect(fs.existsSync(directory)).toBe(false);
});

it('reports creation errors without registering or removing unrelated paths', async () => {
  const root = fixture();
  write(root, 'keep.txt');
  await expect(installerTemp.createTempDir({ dir: path.join(root, 'missing'), prefix: 'si-' }))
    .rejects.toMatchObject({ code: 'ENOENT' });
  expect(temp.cleanupSync()).toEqual({ files: 0, dirs: 0 });
  expect(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8')).toBe('keep.txt');
});

it.each(['sync', 'async'])('retains brace cleanup and reports removal errors: %s', async mode => {
  const root = fixture();
  for (const file of ['one.tmp', 'two.tmp', 'keep.txt']) write(root, file);
  const remove = mode === 'sync' ? rimraf.sync : promisify(rimraf);
  await remove(`${root.replaceAll('\\', '/')}/{one,two}.tmp`);
  expect(fs.readdirSync(root)).toEqual(['keep.txt']);
  const invalid = path.join(root, 'keep.txt\0child');
  if (mode === 'sync') expect(() => remove(invalid)).toThrow();
  else await expect(remove(invalid)).rejects.toMatchObject({ code: 'ERR_INVALID_ARG_VALUE' });
  expect(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8')).toBe('keep.txt');
});
