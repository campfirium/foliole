/* global process */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PREFLIGHT_RECORD_FILE = '.tmp/remote-quality/preflight-record.json';
const RECORD_VERSION = 1;

// The tree hash covers tracked sources; these inputs decide how the selected
// tests run, and the installed dependency manifest is not part of the tree.
export const PREFLIGHT_CONFIG_FILES = [
  'package.json', 'package-lock.json', 'node_modules/.package-lock.json',
  'vite.config.ts', 'vite.shared.ts', 'tsconfig.json',
  'scripts/run-vitest-with-summary.mjs', 'scripts/electron-sqlite-runner.mjs',
  'scripts/quality/quality-fast-capped.mjs', 'scripts/quality/quality-fast-related-tests.mjs',
  'scripts/quality/remote-quality-preflight.mjs', 'scripts/quality/remote-quality-preflight-plan.mjs',
  'scripts/quality/remote-quality-preflight-select.mjs',
  'scripts/quality/remote-quality-preflight-reuse.mjs'
];

function readOptional(file) {
  try {
    return readFileSync(file);
  } catch {
    return null;
  }
}

export function digestConfigFiles(cwd, files = PREFLIGHT_CONFIG_FILES) {
  const hash = createHash('sha256');
  for (const file of files) {
    const content = readOptional(path.join(cwd, file));
    hash.update(`${file}\0${content ? createHash('sha256').update(content).digest('hex') : 'missing'}\n`);
  }
  return hash.digest('hex');
}

function electronVersion(cwd) {
  const manifest = readOptional(path.join(cwd, 'node_modules/electron/package.json'));
  return manifest ? JSON.parse(manifest.toString('utf8')).version ?? null : null;
}

// Hashes the working tree, including uncommitted and untracked files, through
// a throwaway copy of the index so the real index stays untouched.
export function workingTreeHash(cwd) {
  const git = (args, env) => execFileSync('git', args, { cwd, encoding: 'utf8', env }).trim();
  const directory = mkdtempSync(path.join(os.tmpdir(), 'remote-preflight-index-'));
  try {
    const index = path.join(directory, 'index');
    copyFileSync(path.resolve(cwd, git(['rev-parse', '--git-path', 'index'])), index);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    git(['add', '-A'], env);
    return git(['write-tree'], env);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

export function computePreflightFingerprint(cwd) {
  return {
    configDigest: digestConfigFiles(cwd),
    environment: {
      arch: process.arch, electron: electronVersion(cwd), node: process.version, platform: process.platform
    },
    tree: workingTreeHash(cwd)
  };
}

export function readPreflightRecord(file) {
  try {
    const record = JSON.parse(readFileSync(file, 'utf8'));
    return record?.version === RECORD_VERSION && Array.isArray(record.files) ? record : null;
  } catch {
    return null;
  }
}

export function writePreflightRecord(file, fingerprint, files) {
  mkdirSync(path.dirname(file), { recursive: true });
  const record = { version: RECORD_VERSION, ...fingerprint, files: [...files].sort() };
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
}

// Returns null when the record proves the selection already passed, otherwise
// the first unmet condition.
export function preflightReuseMismatch(record, fingerprint, files) {
  if (!record) return 'no readable record';
  if (!fingerprint) return 'fingerprint unavailable';
  if (record.tree !== fingerprint.tree) return 'source tree changed';
  if (record.configDigest !== fingerprint.configDigest) return 'config or dependency lock changed';
  const environment = record.environment ?? {};
  if (Object.entries(fingerprint.environment).some(([key, value]) => environment[key] !== value)) {
    return 'runtime environment changed';
  }
  const covered = new Set(record.files);
  const missing = files.filter((file) => !covered.has(file));
  return missing.length ? `${missing.length} selected test file(s) not in the record` : null;
}
