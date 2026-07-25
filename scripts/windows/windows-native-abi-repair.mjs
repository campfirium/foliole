#!/usr/bin/env node
/* global console, process */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { npmRunCommand as defaultNpmRunCommand, runCapture, runChecked } from './windows-preview-native-runtime.mjs';

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

export async function ensureElectronNativeAbi({
  nativeAbiScript,
  npmRunCommand = defaultNpmRunCommand,
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
  await runCheckedCommand('powershell.exe', preflightArgs, 'verify restored Electron native ABI', repoRoot);
  console.log('[windows-native-abi] status: READY disposition=rebuilt');
  return 'rebuilt';
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
