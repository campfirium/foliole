/* global console, process */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectElectronDistFreshness } from './check-electron-dist-fresh.mjs';
import { writeRendererReloadIntent } from './write-renderer-reload-intent.mjs';
import { writeRestartIntent } from './write-restart-intent.mjs';
import {
  npmRunCommand,
  resolveChangedFiles,
  resolveCurrentHead,
  runCapture,
  runChecked,
  wait
} from './windows-preview-native-runtime.mjs';
import { isTrustedRunningStatus, parseWindowsClientStatus, selectNativePreviewAction } from './windows-preview-native-support.mjs';
import { resolveWindowsNativePaths } from './windows-native-paths.mjs';

const {
  clientScript,
  nativeAbiScript,
  reloadDeliveryFile,
  repoRoot,
  restartDeliveryFile
} = resolveWindowsNativePaths();
const PREVIEW_TIMEOUT_MS = Number.parseInt(process.env.WINDOWS_PREVIEW_TIMEOUT_MS ?? '25000', 10);

async function ensureFreshElectronDist() {
  const freshness = inspectElectronDistFreshness({ repoRoot });
  if (freshness.ok) {
    console.log(`[windows-preview-native] electron-dist fresh checked_sources=${freshness.checkedSourceCount}`);
    return;
  }
  const compile = npmRunCommand('electron:compile');
  await runChecked(compile.command, compile.args, 'compile stale electron-dist', repoRoot);
}

async function verifyNodeModules() {
  const args = ['ls', '--depth=0', '--json', '--silent'];
  let result;
  if (process.env.npm_execpath) {
    result = await runCapture(process.execPath, [process.env.npm_execpath, ...args], { cwd: repoRoot });
  } else {
    result = await runCapture('npm', args, { cwd: repoRoot });
  }
  if (result.code !== 0) {
    const detail = `${result.stdout}${result.stderr}`.split(/\r?\n/u).slice(-80).join('\n');
    throw new Error(`node_modules check failed${detail ? `\n${detail}` : ''}`);
  }
  console.log('[windows-preview-native] node_modules check passed');
}

async function verifyNativeAbi() {
  await runChecked('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    nativeAbiScript,
    '-WorkDir',
    repoRoot,
    '-Run'
  ], 'verify Electron native ABI', repoRoot);
}

async function runClientAction(action) {
  const result = await runCapture(process.execPath, [clientScript, action]);
  const output = `${result.stdout}${result.stderr}`;
  if (output.trim()) {
    console.log(output.trim());
  }
  return { ...result, output };
}

async function readDeliveryNonce(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')).nonce;
  } catch {
    return null;
  }
}

async function waitForDelivery(filePath, nonce, label) {
  const deadline = Date.now() + PREVIEW_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await readDeliveryNonce(filePath) === nonce) {
      console.log(`[windows-preview-native] ${label} delivery acknowledged nonce=${nonce}`);
      return true;
    }
    await wait(500);
  }
  return false;
}

async function waitForTrustedRunning(label, expectedHead = '') {
  const deadline = Date.now() + PREVIEW_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await runCapture(process.execPath, [clientScript, 'status']);
    const parsed = parseWindowsClientStatus(`${status.stdout}${status.stderr}`);
    if (isTrustedRunningStatus(parsed, { expectedHead })) {
      console.log(`[windows-preview-native] ${label}: ${parsed.detail}`);
      return true;
    }
    await wait(1000);
  }
  return false;
}

async function runIntent(action, currentHead, reason) {
  const writer = action === 'restart-intent' ? writeRestartIntent : writeRendererReloadIntent;
  const deliveryPath = action === 'restart-intent' ? restartDeliveryFile : reloadDeliveryFile;
  const label = action === 'restart-intent' ? 'restart' : 'renderer reload';
  const result = await writer({
    head: currentHead,
    reason,
    requestedBy: 'windows-native-preview',
    rootDir: repoRoot
  });
  console.log(`[windows-preview-native] ${label} intent requested nonce=${result.intent.nonce}`);
  if (!await waitForDelivery(deliveryPath, result.intent.nonce, label)) {
    throw new Error(`${label} delivery timed out nonce=${result.intent.nonce}`);
  }
  if (!await waitForTrustedRunning(`${label} status`, currentHead)) {
    throw new Error(`${label} did not reach trusted running status`);
  }
}

async function applyAction(selection, currentHead, dryRun) {
  console.log(`[windows-preview-native] selected action: ${selection.action}`);
  console.log(`[windows-preview-native] reason: ${selection.reason}`);
  if (dryRun) {
    console.log('[windows-preview-native] status: DRY_RUN');
    return 'DRY_RUN';
  }
  if (selection.action === 'sync-only') {
    if (!await waitForTrustedRunning('sync-only status', currentHead)) {
      throw new Error('sync-only status check failed');
    }
    return 'STARTED';
  }
  if (selection.action === 'renderer-reload-intent' || selection.action === 'restart-intent') {
    await runIntent(selection.action, currentHead, selection.reason);
    return 'STARTED';
  }
  if (selection.action === 'status-probe-failed') {
    throw new Error('client status unavailable');
  }
  const action = selection.action === 'fallback-start' ? 'start' : selection.action;
  const result = await runClientAction(action);
  if (result.code !== 0 || !/(status:\s*(STARTED|RUNNING|RESTARTED))/u.test(result.output)) {
    throw new Error(`${action} failed`);
  }
  return 'STARTED';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log('[windows-preview-native] step 1/4: verify electron-dist freshness');
  await ensureFreshElectronDist();
  console.log('[windows-preview-native] step 2/4: verify Windows-native dependencies');
  await verifyNodeModules();
  await verifyNativeAbi();
  console.log('[windows-preview-native] step 3/4: select update action');
  const [currentHead, changedFiles, statusResult] = await Promise.all([
    resolveCurrentHead(repoRoot),
    resolveChangedFiles(repoRoot),
    runClientAction('status')
  ]);
  const status = parseWindowsClientStatus(statusResult.output);
  const selection = selectNativePreviewAction({ changedFiles, currentHead, status });
  console.log('[windows-preview-native] step 4/4: apply update action');
  const finalStatus = await applyAction(selection, currentHead, dryRun);
  if (finalStatus === 'STARTED') {
    console.log('[windows-preview-native] status: STARTED');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[windows-preview-native] status: FAILED reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
