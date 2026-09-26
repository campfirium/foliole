#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
// nwsapi@2.2.27 caused repeatable UI test timeouts on 2026-09-25. Revisit after a newer version passes those tests.
const HELD_NAMES = new Set(['nwsapi']);

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  return result;
}

function packageNameFromPath(packagePath) {
  const parts = packagePath.split('/');
  const index = parts.lastIndexOf('node_modules');
  if (index < 0 || !parts[index + 1]) return null;
  const name = parts[index + 1];
  return name.startsWith('@') ? `${name}/${parts[index + 2] ?? ''}` : name;
}

function directNames(manifest) {
  return new Set(DEPENDENCY_SECTIONS.flatMap((section) => Object.keys(manifest[section] ?? {})));
}

export function selectTransitiveUpdates(manifest, lock, outdated) {
  const installed = new Set(Object.keys(lock.packages ?? {}).map(packageNameFromPath).filter(Boolean));
  const direct = directNames(manifest);
  return Object.entries(outdated)
    .filter(([name, entry]) => installed.has(name) && !direct.has(name) && !HELD_NAMES.has(name)
      && entry?.current && entry?.wanted && entry.current !== entry.wanted)
    .map(([name]) => name)
    .sort();
}

function directVersions(lock, manifest) {
  return Object.fromEntries([...directNames(manifest)].sort().map((name) => [
    name, lock.packages?.[`node_modules/${name}`]?.version ?? null
  ]));
}

function installedVersions(lock, name) {
  return Object.entries(lock.packages ?? {})
    .filter(([packagePath]) => packageNameFromPath(packagePath) === name)
    .map(([packagePath, entry]) => [packagePath, entry.version ?? null]);
}

export function assertTransitiveOnly(beforeManifest, afterManifest, beforeLock, afterLock) {
  if (beforeManifest !== afterManifest) throw new Error('package.json changed');
  if (JSON.stringify(beforeLock.packages?.['']) !== JSON.stringify(afterLock.packages?.[''])) {
    throw new Error('lockfile root changed');
  }
  const manifest = JSON.parse(beforeManifest);
  if (JSON.stringify(directVersions(beforeLock, manifest)) !== JSON.stringify(directVersions(afterLock, manifest))) {
    throw new Error('a direct installed version changed');
  }
  for (const name of HELD_NAMES) {
    if (JSON.stringify(installedVersions(beforeLock, name))
      !== JSON.stringify(installedVersions(afterLock, name))) {
      throw new Error(`held dependency changed: ${name}`);
    }
  }
}

function readLock() {
  return JSON.parse(readFileSync('package-lock.json', 'utf8'));
}

function main() {
  if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--list')) {
    throw new Error('usage: npm run maintenance:transitive-lockfile [-- --list]');
  }
  const branch = run('git', ['branch', '--show-current']);
  if (branch.status !== 0 || branch.stdout.trim() !== 'dev') {
    throw new Error('transitive refresh requires local dev');
  }
  if (process.argv[2] !== '--list') {
    const dirty = run('git', ['status', '--porcelain', '--', 'package.json', 'package-lock.json']);
    if (dirty.status !== 0 || dirty.stdout.trim()) {
      throw new Error('package.json and package-lock.json must be clean before refresh');
    }
  }
  const beforeManifest = readFileSync('package.json', 'utf8');
  const beforeLock = readLock();
  const outdatedResult = run('npm', ['outdated', '--all', '--json']);
  if (![0, 1].includes(outdatedResult.status)) {
    throw new Error(`npm outdated failed: ${outdatedResult.stderr.trim()}`);
  }
  const outdated = JSON.parse(outdatedResult.stdout || '{}');
  const names = selectTransitiveUpdates(JSON.parse(beforeManifest), beforeLock, outdated);
  console.log(`[transitive-refresh] eligible=${names.length} held=${[...HELD_NAMES].join(',')}`);
  if (process.argv[2] === '--list' || names.length === 0) {
    if (names.length) console.log(names.join('\n'));
    return;
  }
  const result = run('npm', ['update', ...names, '--package-lock-only', '--no-save', '--ignore-scripts']);
  if (result.status !== 0) throw new Error(`npm update failed: ${result.stderr.trim()}`);
  assertTransitiveOnly(beforeManifest, readFileSync('package.json', 'utf8'), beforeLock, readLock());
  console.log(`[transitive-refresh] lockfile refreshed; requested=${names.length}`);
}

if (process.argv[1]?.endsWith('/refresh-transitive-dependencies.mjs')) {
  try {
    main();
  } catch (error) {
    console.error(`[transitive-refresh] ${error.message}`);
    process.exitCode = 1;
  }
}
