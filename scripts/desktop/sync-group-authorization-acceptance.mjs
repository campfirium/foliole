#!/usr/bin/env node
/* global console, process */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { resolveElectronBinary } from '../electron-sqlite-runner.mjs';

const root = path.resolve('.tmp/artifacts/sync-group-authorization/desktop');
const entry = path.join(root, 'sync-group-authorization-main.cjs');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: 'utf8', timeout: 600_000, ...options });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} failed with ${result.status}`);
  return result.stdout;
}

function frozenRevision() {
  if (run('git', ['status', '--porcelain', '--untracked-files=no']).trim()) {
    throw new Error('safeStorage acceptance requires a clean tracked worktree');
  }
  const revision = run('git', ['rev-parse', 'HEAD']).trim();
  if (revision !== run('git', ['rev-parse', 'origin/dev']).trim()) {
    throw new Error('safeStorage acceptance requires HEAD == origin/dev');
  }
  return revision;
}

function main() {
  const revision = frozenRevision();
  mkdirSync(root, { recursive: true });
  run(path.resolve('node_modules/.bin/esbuild'), [
    'electron/sync/syncGroupAuthorizationAcceptanceMain.ts', '--bundle', '--platform=node',
    '--format=cjs', '--external:electron', `--outfile=${entry}`
  ]);
  const env = { ...process.env, FOLIOLE_SYNC_GROUP_AUTHORIZATION_ARTIFACT_ROOT: root,
    FOLIOLE_SYNC_GROUP_AUTHORIZATION_REVISION: revision };
  run(resolveElectronBinary(), [entry], { env });
  const receiptPath = path.join(root, 'safe-storage-receipt.json');
  if (!existsSync(receiptPath)) throw new Error('safeStorage receipt was not produced');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  if (receipt.status !== 'passed' || receipt.accepted_tip !== revision) {
    throw new Error('safeStorage receipt does not bind the frozen revision');
  }
  console.log(JSON.stringify(receipt, null, 2));
}

main();
