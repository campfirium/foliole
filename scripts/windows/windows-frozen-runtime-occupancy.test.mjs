// @vitest-environment node
/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, expect, it } from 'vitest';

import {
  assertFrozenRuntimeOccupied, frozenRuntimeFingerprint,
  startFrozenRuntimeOccupancy, stopFrozenRuntimeOccupancy
} from './windows-frozen-runtime-occupancy.mjs';

const require = createRequire(import.meta.url);
const installedRoot = path.dirname(require.resolve('better-sqlite3/package.json'));
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

function fixture() {
  const artifactRoot = path.resolve('.tmp/artifacts');
  fs.mkdirSync(artifactRoot, { recursive: true });
  const root = fs.realpathSync(fs.mkdtempSync(path.join(artifactRoot, 'frozen-runtime-')));
  roots.push(root);
  const packageRoot = path.join(root, 'node_modules', 'better-sqlite3');
  fs.mkdirSync(path.join(packageRoot, 'lib'), { recursive: true });
  for (const file of ['package.json', 'lib/binding.js']) {
    fs.copyFileSync(path.join(installedRoot, file), path.join(packageRoot, file));
  }
  fs.writeFileSync(path.join(root, 'package-lock.json'), 'lock');
  const { getPrebuildPath } = require(path.join(packageRoot, 'lib', 'binding.js'));
  const target = `${process.platform}-${process.arch}.node`;
  const prebuild = path.join(packageRoot, 'prebuilds', target);
  const debug = path.join(packageRoot, 'build', 'Debug', 'better_sqlite3.node');
  const release = path.join(packageRoot, 'build', 'Release', 'better_sqlite3.node');
  return { root, prebuild, debug, release, getPrebuildPath };
}

function write(file, content = 'native') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

it('fingerprints the installed platform prebuild without loading the native addon', () => {
  const { root, prebuild, release, getPrebuildPath } = fixture();
  write(prebuild);
  write(release, 'unused release');
  expect(getPrebuildPath()).toBe(prebuild);
  expect(frozenRuntimeFingerprint(root)).toMatchObject({
    lockfileDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    nativeModuleDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    nativeModulePath: prebuild, sourceRoot: root
  });
  const before = frozenRuntimeFingerprint(root);
  write(release, 'changed unused release');
  expect(frozenRuntimeFingerprint(root)).toEqual(before);
});

it('uses the same Debug then Release selection as the installed source-build loader', () => {
  const { root, debug, release } = fixture();
  write(release);
  expect(frozenRuntimeFingerprint(root).nativeModulePath).toBe(release);
  write(debug);
  expect(frozenRuntimeFingerprint(root).nativeModulePath).toBe(debug);
});

it('rejects a missing module even when another platform prebuild exists', () => {
  const { root, prebuild } = fixture();
  write(path.join(path.dirname(prebuild), 'unsupported-platform.node'));
  expect(() => frozenRuntimeFingerprint(root)).toThrow('native module is missing');
});

it.each(['native', 'lockfile', 'path', 'missing'])('rejects an occupied runtime after %s changes', (change) => {
  const { root, prebuild, release } = fixture();
  write(prebuild);
  write(release);
  const occupancy = { child: { exitCode: null },
    fingerprint: frozenRuntimeFingerprint(root), sourceRoot: root };
  expect(assertFrozenRuntimeOccupied(occupancy)).toEqual(occupancy.fingerprint);
  if (change === 'native') write(prebuild, 'changed');
  if (change === 'lockfile') write(path.join(root, 'package-lock.json'), 'changed');
  if (change === 'path' || change === 'missing') fs.unlinkSync(prebuild);
  if (change === 'missing') fs.unlinkSync(release);
  expect(() => assertFrozenRuntimeOccupied(occupancy)).toThrow();
});

it('holds and releases an actual child process for a prebuild-only frozen copy', async () => {
  const { root, prebuild } = fixture();
  write(prebuild);
  const occupancy = await startFrozenRuntimeOccupancy(root, { nodeBin: process.execPath });
  try {
    expect(occupancy.pid).toBeGreaterThan(0);
    expect(assertFrozenRuntimeOccupied(occupancy).nativeModulePath).toBe(prebuild);
  } finally {
    await stopFrozenRuntimeOccupancy(occupancy);
  }
  expect(occupancy.child.exitCode !== null || occupancy.child.signalCode !== null).toBe(true);
});
