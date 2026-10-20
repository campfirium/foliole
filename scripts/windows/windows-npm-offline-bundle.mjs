/* global process */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Windows installs dependencies with `npm ci --offline`, so the Mac packs every
// locked tarball Windows x64 needs, verifies it against the lock and ships the
// set over the LAN; Windows imports it with `npm cache add`.
// The bundle sits directly in `.tmp/artifacts`, which exists on both hosts.
export const WINDOWS_NPM_BUNDLE_ROOT = '.tmp/artifacts';
const STAGING_DIR = '.tmp/artifacts/windows-npm-offline';
const PACK_CHUNK = 150;

export function windowsNpmBundleName(lockBlob) {
  return `windows-npm-bundle-${lockBlob}.tar`;
}

function allows(list, value) {
  if (!Array.isArray(list) || list.length === 0) return true;
  if (list.includes(`!${value}`)) return false;
  return list.includes(value) || list.every((entry) => entry.startsWith('!'));
}

// Every registry tarball a Windows x64 install can need, once per integrity.
export function windowsLockTarballs(lock) {
  const byIntegrity = new Map();
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key || entry.link || entry.inBundle || !entry.resolved || !entry.integrity) continue;
    if (!/^https?:\/\//u.test(entry.resolved)) continue;
    if (!allows(entry.os, 'win32') || !allows(entry.cpu, 'x64')) continue;
    byIntegrity.set(entry.integrity, { integrity: entry.integrity, resolved: entry.resolved });
  }
  return [...byIntegrity.values()].sort((left, right) => left.resolved.localeCompare(right.resolved));
}

function integrityOf(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

function fileName(integrity) {
  return `${createHash('sha256').update(integrity).digest('hex').slice(0, 32)}.tgz`;
}

function checked(run, command, args, options) {
  const result = run(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim().split('\n').slice(-3).join(' ');
    throw new Error(`${command} ${args[0]} failed while preparing the Windows npm bundle: ${detail}`);
  }
  return result.stdout;
}

// Packs from the Mac npm cache first and downloads only what it lacks.
function packTarballs({ fsApi, repoRoot, root, run, tarballs }) {
  const staging = path.join(root, 'staging');
  const output = path.join(root, 'tarballs');
  fsApi.mkdirSync(staging, { recursive: true });
  fsApi.mkdirSync(output, { recursive: true });
  const files = [];
  for (let index = 0; index < tarballs.length; index += PACK_CHUNK) {
    const chunk = tarballs.slice(index, index + PACK_CHUNK);
    const packed = JSON.parse(checked(run, 'npm', ['pack', ...chunk.map(({ resolved }) => resolved),
      '--pack-destination', staging, '--prefer-offline', '--json'], { cwd: repoRoot }));
    packed.forEach((result, offset) => {
      const expected = chunk[offset].integrity;
      const bytes = fsApi.readFileSync(path.join(staging, result.filename));
      if (integrityOf(bytes) !== expected) {
        throw new Error(`Packed ${chunk[offset].resolved} does not match the locked integrity`);
      }
      const file = fileName(expected);
      fsApi.writeFileSync(path.join(output, file), bytes);
      fsApi.rmSync(path.join(staging, result.filename), { force: true });
      files.push({ file, integrity: expected });
    });
  }
  fsApi.rmSync(staging, { force: true, recursive: true });
  return files;
}

export function prepareWindowsNpmBundle({ fsApi = fs, repoRoot, revision, run = spawnSync }) {
  const lockBlob = checked(run, 'git', ['rev-parse', `${revision}:package-lock.json`], { cwd: repoRoot }).trim();
  const bundlePath = path.join(repoRoot, WINDOWS_NPM_BUNDLE_ROOT, windowsNpmBundleName(lockBlob));
  if (fsApi.existsSync(bundlePath)) return { bundlePath, lockBlob, reused: true };
  const lock = JSON.parse(checked(run, 'git', ['show', `${revision}:package-lock.json`], { cwd: repoRoot }));
  const root = path.join(repoRoot, STAGING_DIR, lockBlob);
  fsApi.rmSync(root, { force: true, recursive: true });
  const files = packTarballs({ fsApi, repoRoot, root, run, tarballs: windowsLockTarballs(lock) });
  fsApi.writeFileSync(path.join(root, 'manifest.json'),
    `${JSON.stringify({ files, lockBlob, schemaVersion: 1 }, null, 2)}\n`);
  const partial = `${bundlePath}.partial`;
  checked(run, 'tar', ['-cf', partial, '-C', root, 'manifest.json', 'tarballs'], { cwd: repoRoot,
    env: { ...process.env, COPYFILE_DISABLE: '1' } });
  fsApi.renameSync(partial, bundlePath);
  fsApi.rmSync(root, { force: true, recursive: true });
  return { bundlePath, count: files.length, lockBlob, reused: false };
}

// Ships the bundle beside the Electron archive in the fixed Windows checkout.
export async function transferWindowsNpmBundle({ env, executeScp, fsApi = fs, home, host, prepare =
  prepareWindowsNpmBundle, repoRoot, revision, transport }) {
  const bundle = prepare({ fsApi, repoRoot, revision });
  await executeScp(['-q', ...transport({ env, fsApi, home, host }).options, bundle.bundlePath,
    `${host}:D:/C/foliole/${WINDOWS_NPM_BUNDLE_ROOT}/${path.basename(bundle.bundlePath)}`], { env });
  return bundle;
}
