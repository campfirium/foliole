#!/usr/bin/env node
/* global console, process */

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { prepareMacosHiddenElectronRuntime } from './macos-hidden-electron-runtime.mjs';

const root = path.resolve('.tmp/artifacts/sync-group-authorization/desktop');
const compiledRoot = path.join(root, 'compiled');
const entry = path.join(compiledRoot, 'electron/sync/syncGroupAuthorizationAcceptanceMain.js');

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
  rmSync(compiledRoot, { force: true, recursive: true });
  run(process.execPath, [path.resolve('node_modules/typescript/lib/tsc.js'),
    'electron/sync/syncGroupAuthorizationAcceptanceMain.ts', '--outDir', compiledRoot,
    '--rootDir', '.', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--target', 'ES2022', '--esModuleInterop', '--skipLibCheck'
  ]);
  const runtime = prepareMacosHiddenElectronRuntime({ appRoot: process.cwd() });
  const env = { ...process.env,
    FOLIOLE_HIDDEN_CREDENTIAL_APP_NAME: `Foliole Hidden Native ${runtime.runtimeFingerprint.slice(0, 20)}`,
    FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH: entry,
    FOLIOLE_SYNC_GROUP_AUTHORIZATION_ARTIFACT_ROOT: root,
    FOLIOLE_SYNC_GROUP_AUTHORIZATION_REVISION: revision };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    run(runtime.executablePath, [path.resolve(
      'scripts/desktop/macos-hidden-electron-credential-bootstrap.mjs'
    )], { env });
  } finally {
    runtime.cleanup();
  }
  const receiptPath = path.join(root, 'safe-storage-receipt.json');
  if (!existsSync(receiptPath)) throw new Error('safeStorage receipt was not produced');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  if (receipt.status !== 'passed' || receipt.accepted_tip !== revision) {
    throw new Error('safeStorage receipt does not bind the frozen revision');
  }
  console.log(JSON.stringify(receipt, null, 2));
}

main();
