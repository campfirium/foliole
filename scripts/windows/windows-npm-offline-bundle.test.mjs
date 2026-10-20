// @vitest-environment node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import {
  prepareWindowsNpmBundle, windowsLockTarballs, windowsNpmBundleName
} from './windows-npm-offline-bundle.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

const integrity = (text) => `sha512-${createHash('sha512').update(text).digest('base64')}`;
const url = (name) => `https://registry.example/${name}/-/${name}-1.0.0.tgz`;

function lockOf(entries) {
  return { packages: { '': { name: 'root' }, ...Object.fromEntries(entries.map(([name, extra]) => [
    `node_modules/${name}`, { integrity: integrity(name), resolved: url(name), version: '1.0.0', ...extra }
  ])) } };
}

it('keeps every tarball a Windows x64 install can need, once per integrity', () => {
  const lock = lockOf([['plain'], ['win', { cpu: ['x64'], os: ['win32'] }],
    ['mac', { os: ['darwin'] }], ['arm', { cpu: ['arm64'] }], ['notmac', { os: ['!darwin'] }],
    ['notwin', { os: ['!win32'] }]]);
  lock.packages['node_modules/a/node_modules/plain'] = lock.packages['node_modules/plain'];
  lock.packages['node_modules/linked'] = { link: true, resolved: 'packages/linked' };
  expect(windowsLockTarballs(lock).map(({ resolved }) => resolved))
    .toEqual([url('notmac'), url('plain'), url('win')]);
});

function fakeRun(lock, { corrupt = false } = {}) {
  return vi.fn((command, args) => {
    if (command === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: 'f'.repeat(40) };
    if (command === 'git') return { status: 0, stdout: JSON.stringify(lock) };
    if (command === 'npm') {
      const destination = args[args.indexOf('--pack-destination') + 1];
      const specs = args.slice(1, args.indexOf('--pack-destination'));
      const packed = specs.map((spec) => {
        const name = spec.split('/')[3];
        fs.writeFileSync(path.join(destination, `${name}.tgz`), corrupt ? 'tampered' : name);
        return { filename: `${name}.tgz` };
      });
      return { status: 0, stdout: JSON.stringify(packed) };
    }
    fs.writeFileSync(args[1], 'tar');
    return { status: 0, stdout: '' };
  });
}

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-npm-bundle-'));
  roots.push(root);
  return root;
}

it('packs verified tarballs once per lock and reuses the bundle', () => {
  const root = repo();
  const run = fakeRun(lockOf([['alpha'], ['beta']]));
  const first = prepareWindowsNpmBundle({ repoRoot: root, revision: 'HEAD', run });
  expect(first).toMatchObject({ count: 2, lockBlob: 'f'.repeat(40), reused: false });
  expect(path.basename(first.bundlePath)).toBe(windowsNpmBundleName('f'.repeat(40)));
  expect(run.mock.calls.find(([command]) => command === 'npm')[1]).toEqual(expect.arrayContaining([
    'pack', url('alpha'), url('beta'), '--prefer-offline', '--json']));
  expect(prepareWindowsNpmBundle({ repoRoot: root, revision: 'HEAD', run })).toMatchObject({ reused: true });
  expect(run.mock.calls.filter(([command]) => command === 'npm')).toHaveLength(1);
});

it('refuses a packed tarball that does not match the locked integrity', () => {
  const root = repo();
  const run = fakeRun(lockOf([['alpha']]), { corrupt: true });
  expect(() => prepareWindowsNpmBundle({ repoRoot: root, revision: 'HEAD', run }))
    .toThrow('does not match the locked integrity');
  expect(fs.existsSync(path.join(root, '.tmp', 'artifacts', windowsNpmBundleName('f'.repeat(40)))))
    .toBe(false);
});
