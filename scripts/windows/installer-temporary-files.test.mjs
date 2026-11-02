// @vitest-environment node

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const installerTemp = require('electron-winstaller/lib/temp-utils.js');
const installerRequire = createRequire(require.resolve('electron-winstaller/lib/temp-utils.js'));
const temp = installerRequire('temp');
const tempRequire = createRequire(installerRequire.resolve('temp'));
const rimraf = tempRequire('rimraf');
const rimrafRequire = createRequire(tempRequire.resolve('rimraf'));
const glob = rimrafRequire('glob');
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

it('matches installer cleanup patterns through the actual legacy glob dependency', async () => {
  const cwd = fixture();
  for (const name of ['one.txt', 'two.log', 'nested/three.txt', 'nested/.hidden.txt',
    'ignored/four.txt', 'literal[1].txt']) write(cwd, name);
  const cases = [
    ['**/*.{txt,log}', { ignore: 'ignored/**' },
      ['literal[1].txt', 'nested/three.txt', 'one.txt', 'two.log']],
    ['nested/**/*.txt', { dot: true }, ['nested/.hidden.txt', 'nested/three.txt']],
    ['missing{1,2}.txt', { nonull: true }, ['missing1.txt', 'missing2.txt']],
    ['literal\\[1\\].txt', {}, ['literal[1].txt']]
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
