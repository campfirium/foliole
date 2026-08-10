#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { protectOwnedLibrary } from '../desktop/sync-group-library-protection.mjs';
import { stopMacosElectronDev } from './macos-electron-dev-actions.mjs';
import {
  MACOS_DAILY_LIBRARY_HOME, resolveMacosElectronDevPaths
} from './macos-electron-dev-paths.mjs';

function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr, stdout }));
  });
}

function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== '--label' || argv[2] !== '--candidate') {
    throw new Error('usage: macos protection --label <original|baseline> --candidate <revision>');
  }
  if (!['original', 'baseline'].includes(argv[1]) || !/^[0-9a-f]{40}$/u.test(argv[3])) {
    throw new Error('macOS Sync Group protection arguments are invalid.');
  }
  return { candidate: argv[3], label: argv[1] };
}

async function assertDatabaseOwnerStopped(databasePath, executeProcess) {
  const result = await executeProcess('/usr/sbin/lsof', ['-t', '--', databasePath], { timeout: 30_000 });
  if (result.code === 0 && result.stdout.trim()) {
    throw new Error('macOS Foliole database still has an active owner.');
  }
  if (![0, 1].includes(result.code)) throw new Error('macOS database owner preflight failed.');
}

export async function runMacosSyncGroupLibraryProtection({ candidate, executeProcess = execute,
  label, repoRoot = process.cwd(), stopOwner = stopMacosElectronDev }) {
  const devPaths = resolveMacosElectronDevPaths(repoRoot);
  await stopOwner({ paths: devPaths });
  const databasePath = path.join(MACOS_DAILY_LIBRARY_HOME, 'Data', 'foliole.db');
  await assertDatabaseOwnerStopped(databasePath, executeProcess);
  const electron = path.join(repoRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
  const inspector = path.join(repoRoot, 'scripts/windows/windows-sync-group-recovery-inspect.mjs');
  const inspectDatabase = async (target) => {
    const result = await executeProcess(electron, [inspector, target], {
      cwd: repoRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 30_000
    });
    if (result.code !== 0) throw new Error(`macOS library inspection failed: ${result.stderr.trim()}`);
    return JSON.parse(result.stdout.trim());
  };
  const restoreRoot = path.join(
    repoRoot, '.lab', 'internal', 't121-device-backups', 'macos-a', candidate, label
  );
  const protection = await protectOwnedLibrary({ backupRoot: restoreRoot, device: 'A',
    inspectDatabase, ownerStopped: true, sourceRoot: MACOS_DAILY_LIBRARY_HOME });
  const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts', 't121-macos-protection', candidate);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const manifestPath = path.join(evidenceRoot, `${label}-manifest.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify({ candidate, completedAt: new Date().toISOString(),
    label, protection, resultStatus: 'success', schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { manifestPath, protection };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await runMacosSyncGroupLibraryProtection(parseArgs(process.argv.slice(2)));
    console.log(`[macos-sync-group-protection] evidence=${result.manifestPath}`);
  } catch (error) {
    console.error(`[macos-sync-group-protection] ${error.message}`);
    process.exitCode = 1;
  }
}
