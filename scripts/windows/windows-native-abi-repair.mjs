#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createNpmCommand as defaultCreateNpmCommand,
  npmRunCommand as defaultNpmRunCommand,
  runCapture,
  runChecked
} from './windows-preview-native-runtime.mjs';

function createNativeAbiPreflightArgs(nativeAbiScript, repoRoot) {
  return [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    nativeAbiScript,
    '-WorkDir',
    repoRoot,
    '-Run'
  ];
}

function printOutput(result) {
  if (result.stdout.trim()) {
    console.log(result.stdout.trim());
  }
  if (result.stderr.trim()) {
    console.error(result.stderr.trim());
  }
}

export function electronRebuildSourceCommand(createNpmCommand = defaultCreateNpmCommand) {
  return createNpmCommand([
    'exec', '--', 'electron-rebuild',
    '-f', '--build-from-source', '-w', 'better-sqlite3', '-m', '.', '-s'
  ]);
}

async function runCheckedWithOutput(command, args, label, cwd, runCaptureCommand) {
  console.log(`[windows-preview-native] ${label}`);
  const result = await runCaptureCommand(command, args, { cwd });
  printOutput(result);
  if (result.code !== 0) {
    throw new Error(`${label} failed`);
  }
}

function readElectronAbiVersion(repoRoot) {
  return fs.readFileSync(path.join(repoRoot, 'node_modules', 'electron', 'abi_version'), 'utf8').trim();
}

async function verifyElectronAbiByNodeMismatch(repoRoot, runCaptureCommand, readElectronAbiVersionFn) {
  const electronAbi = readElectronAbiVersionFn(repoRoot);
  const result = await runCaptureCommand(process.execPath, [
    '-e',
    "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.close(); console.log(JSON.stringify(process.versions))"
  ], { cwd: repoRoot });
  printOutput(result);
  if (result.code === 0) {
    throw new Error('Electron ABI verification failed: better-sqlite3 is still loadable in plain Node');
  }
  const detail = `${result.stdout}\n${result.stderr}`;
  const match = /NODE_MODULE_VERSION\s+(\d+)[\s\S]*?requires\s+NODE_MODULE_VERSION\s+(\d+)/u.exec(detail);
  if (!match || match[1] !== electronAbi) {
    throw new Error(`Electron ABI verification failed: expected module ABI ${electronAbi}`);
  }
  console.log(`[windows-native-abi] Electron ABI verified by Node mismatch module=${match[1]} node=${match[2]}`);
}

export async function ensureElectronNativeAbi({
  createNpmCommand = defaultCreateNpmCommand,
  nativeAbiScript,
  npmRunCommand = defaultNpmRunCommand,
  readElectronAbiVersionFn = readElectronAbiVersion,
  repoRoot,
  runCaptureCommand = runCapture,
  runCheckedCommand = runChecked
}) {
  const preflightArgs = createNativeAbiPreflightArgs(nativeAbiScript, repoRoot);
  console.log('[windows-preview-native] verify Electron native ABI');
  const firstCheck = await runCaptureCommand('powershell.exe', preflightArgs, { cwd: repoRoot });
  printOutput(firstCheck);
  if (firstCheck.code === 0) {
    console.log('[windows-native-abi] status: READY disposition=preflight');
    return 'preflight';
  }

  console.log('[windows-preview-native] Electron native ABI mismatch detected; restoring better-sqlite3 for Electron');
  const rebuild = npmRunCommand('electron:rebuild:native');
  await runCheckedCommand(rebuild.command, rebuild.args, 'restore Electron native ABI', repoRoot);
  console.log('[windows-preview-native] verify restored Electron native ABI');
  const secondCheck = await runCaptureCommand('powershell.exe', preflightArgs, { cwd: repoRoot });
  printOutput(secondCheck);
  if (secondCheck.code === 0) {
    console.log('[windows-native-abi] status: READY disposition=rebuilt');
    return 'rebuilt';
  }
  console.log('[windows-preview-native] restored ABI still invalid; rebuilding better-sqlite3 from source for Electron');
  const sourceRebuild = electronRebuildSourceCommand(createNpmCommand);
  await runCheckedWithOutput(
    sourceRebuild.command, sourceRebuild.args, 'restore Electron native ABI from source', repoRoot, runCaptureCommand
  );
  try {
    await runCheckedCommand('powershell.exe', preflightArgs, 'verify source-restored Electron native ABI', repoRoot);
  } catch {
    console.log('[windows-preview-native] Electron runtime launch unavailable; verifying rebuilt module ABI without launching Electron');
    await verifyElectronAbiByNodeMismatch(repoRoot, runCaptureCommand, readElectronAbiVersionFn);
  }
  console.log('[windows-native-abi] status: READY disposition=source-rebuilt');
  return 'source-rebuilt';
}

function parseRepoRoot(argv) {
  const index = argv.indexOf('--repo-root');
  if (index < 0 || !argv[index + 1] || argv.length !== 2) {
    throw new Error('usage: node scripts/windows/windows-native-abi-repair.mjs --repo-root <path>');
  }
  return path.resolve(argv[index + 1]);
}

async function main() {
  const repoRoot = parseRepoRoot(process.argv.slice(2));
  const nativeAbiScript = path.join(repoRoot, 'scripts', 'windows', 'native-abi-preflight.ps1');
  await ensureElectronNativeAbi({ nativeAbiScript, repoRoot });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[windows-native-abi] status: FAILED reason=${error.message}`);
    process.exitCode = 1;
  });
}
