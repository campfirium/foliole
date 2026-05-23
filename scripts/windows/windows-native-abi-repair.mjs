/* global console */

import { npmRunCommand, runCapture, runChecked } from './windows-preview-native-runtime.mjs';

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

export async function ensureElectronNativeAbi({ nativeAbiScript, repoRoot }) {
  const preflightArgs = createNativeAbiPreflightArgs(nativeAbiScript, repoRoot);
  console.log('[windows-preview-native] verify Electron native ABI');
  const firstCheck = await runCapture('powershell.exe', preflightArgs, { cwd: repoRoot });
  printOutput(firstCheck);
  if (firstCheck.code === 0) {
    return;
  }

  console.log('[windows-preview-native] Electron native ABI mismatch detected; restoring better-sqlite3 for Electron');
  const rebuild = npmRunCommand('electron:rebuild:native');
  await runChecked(rebuild.command, rebuild.args, 'restore Electron native ABI', repoRoot);
  await runChecked('powershell.exe', preflightArgs, 'verify restored Electron native ABI', repoRoot);
}
