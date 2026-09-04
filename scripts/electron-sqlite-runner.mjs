#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ensureElectronBinary } from './electron-runtime-binary.mjs';

export function resolveElectronBinary(repoRoot = process.cwd(), platform = process.platform) {
  if (platform === 'darwin') {
    return path.join(repoRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
  }
  const executable = platform === 'win32' ? 'electron.exe' : 'electron';
  return path.join(repoRoot, 'node_modules', 'electron', 'dist', executable);
}

export function resolveElectronSqliteTempRoot(repoRoot = process.cwd()) {
  return path.join(repoRoot, '.tmp', 'electron-sqlite-tmp');
}

function shouldUseRepoLocalTemp(args = []) {
  const scriptPath = args[0] ?? '';
  if (scriptPath === 'scripts/test-files.mjs') {
    return true;
  }
  return scriptPath === 'scripts/run-vitest-with-summary.mjs' && args.some((arg) => {
    const normalized = arg.replaceAll('\\', '/');
    return normalized === 'electron' || normalized.startsWith('electron/');
  });
}

export function buildElectronNodeEnv(env = process.env, repoRoot = process.cwd(), options = {}) {
  if (!options.useRepoLocalTemp) {
    return {
      ...env,
      ELECTRON_RUN_AS_NODE: '1'
    };
  }
  const tempRoot = resolveElectronSqliteTempRoot(repoRoot);
  return {
    ...env,
    ELECTRON_RUN_AS_NODE: '1',
    TEMP: tempRoot,
    TMP: tempRoot,
    TMPDIR: tempRoot
  };
}

export function buildElectronNodeArgs(scriptPath, scriptArgs = []) {
  const extension = path.extname(scriptPath).toLowerCase();
  const stripTypesArgs = extension === '.ts'
    ? ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs', '--experimental-strip-types']
    : [];
  return [...stripTypesArgs, scriptPath, ...scriptArgs];
}

export function buildRunnerInvocation(scriptPath, scriptArgs = [], repoRoot = process.cwd()) {
  const args = buildElectronNodeArgs(scriptPath, scriptArgs);
  return {
    args,
    cwd: repoRoot,
    electronPath: resolveElectronBinary(repoRoot),
    env: buildElectronNodeEnv({}, repoRoot, { useRepoLocalTemp: shouldUseRepoLocalTemp(args) })
  };
}

export function buildElectronNodeSpawnOptions(repoRoot = process.cwd(), stdio = 'inherit', args = []) {
  const useRepoLocalTemp = shouldUseRepoLocalTemp(args);
  if (useRepoLocalTemp) {
    mkdirSync(resolveElectronSqliteTempRoot(repoRoot), { recursive: true });
  }
  return {
    cwd: repoRoot,
    env: buildElectronNodeEnv(process.env, repoRoot, { useRepoLocalTemp }),
    stdio,
    ...(stdio === 'inherit' ? {} : { encoding: 'utf8' })
  };
}

function writePreflightScript(tempDir, repoRoot) {
  const modulePath = path.join(repoRoot, 'node_modules', 'better-sqlite3').replaceAll('\\', '/');
  const scriptPath = path.join(tempDir, 'better-sqlite3-electron-preflight.cjs');
  writeFileSync(
    scriptPath,
    [
      'try {',
      `  const Database = require('${modulePath}');`,
      "  const db = new Database(':memory:');",
      "  db.prepare('SELECT 1').get();",
      '  db.close();',
      '} catch (error) {',
      '  console.error(error && (error.stack || error.message) ? (error.stack || error.message) : String(error));',
      '  process.exit(1);',
      '}'
    ].join('\n'),
    'utf8'
  );
  return scriptPath;
}

function runElectronNode(electronPath, args, repoRoot, stdio = 'inherit') {
  return spawnSync(electronPath, args, buildElectronNodeSpawnOptions(repoRoot, stdio, args));
}

export function assertElectronAbi(electronPath, repoRoot) {
  const tempRoot = path.join(repoRoot, '.tmp');
  mkdirSync(tempRoot, { recursive: true });
  const tempDir = mkdtempSync(path.join(tempRoot, 'electron-sqlite-runner-'));
  try {
    const preflightScript = writePreflightScript(tempDir, repoRoot);
    const result = runElectronNode(electronPath, [preflightScript], repoRoot, ['ignore', 'pipe', 'pipe']);
    if (result.status === 0) {
      return;
    }
    const detail = [result.error?.message, result.signal, result.stdout, result.stderr]
      .filter(Boolean)
      .join('\n')
      .trim();
    throw new Error([
      'better-sqlite3 is not loadable in the Electron ABI.',
      'Run `npm run electron:rebuild:native` before using real sqlite scripts.',
      detail ? `detail=${detail}` : ''
    ].filter(Boolean).join(' '));
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

function main() {
  const rawArgs = process.argv.slice(2);
  const preflightOnly = rawArgs[0] === '--preflight';
  const dryRun = rawArgs[0] === '--dry-run';
  const [scriptPath, ...scriptArgs] = dryRun ? rawArgs.slice(1) : rawArgs;
  const repoRoot = process.cwd();
  if (preflightOnly) {
    assertElectronAbi(ensureElectronBinary(repoRoot), repoRoot);
    process.stdout.write('better-sqlite3 loaded in Electron ABI\n');
    return;
  }
  if (!scriptPath) {
    console.error('usage: node scripts/electron-sqlite-runner.mjs [--preflight|--dry-run] <script> [...args]');
    process.exitCode = 1;
    return;
  }

  const invocation = buildRunnerInvocation(scriptPath, scriptArgs, repoRoot);
  if (dryRun) {
    process.stdout.write(`${JSON.stringify(invocation, null, 2)}\n`);
    return;
  }
  const electronPath = ensureElectronBinary(repoRoot);
  assertElectronAbi(electronPath, repoRoot);
  const result = runElectronNode(electronPath, invocation.args, repoRoot);
  if (result.error) {
    console.error(result.error.message);
  }
  if (result.status !== 0) {
    console.error(`[electron-sqlite-runner] child exited status=${result.status ?? 'null'} signal=${result.signal ?? 'null'}`);
  }
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/electron-sqlite-runner.mjs')) {
  main();
}
