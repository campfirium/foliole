/* global console, process */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TARGET_PATHS } from '../preview/preview-dedupe-targets.mjs';
import { inspectElectronDistFreshness } from './check-electron-dist-fresh.mjs';
import { ensureWindowsNativeDependencies } from './windows-native-dependencies.mjs';
import { writeRendererReloadIntent } from './write-renderer-reload-intent.mjs';
import { writeRestartIntent } from './write-restart-intent.mjs';
import { ensureElectronNativeAbi } from './windows-native-abi-repair.mjs';
import {
  npmRunCommand,
  resolveChangedFiles,
  resolveCommittedFilesSince,
  resolveCurrentHead,
  runCapture,
  runChecked,
  wait
} from './windows-preview-native-runtime.mjs';
import { formatPreviewActionFailure } from './windows-preview-native-failure.mjs';
import { isBootEventAfterIntent, isMatchingPreviewDelivery, isTrustedRunningStatus, parseWindowsClientStatus, selectNativePreviewActionWithCommittedFiles } from './windows-preview-native-support.mjs';
import { resolveWindowsNativePaths } from './windows-native-paths.mjs';

const { appReadyFile, clientScript, nativeAbiScript, reloadDeliveryFile, repoRoot, restartDeliveryFile } =
  resolveWindowsNativePaths();
const CLIENT_HEALTH_TIMEOUT_MS = Number.parseInt(process.env.FOLIOLE_ELECTRON_HEALTHCHECK_MS ?? '60000', 10);
const PREVIEW_TIMEOUT_MS = Number.parseInt(process.env.WINDOWS_PREVIEW_TIMEOUT_MS ?? String(CLIENT_HEALTH_TIMEOUT_MS + 15000), 10);
const CLIENT_ACTION_TIMEOUT_MS = Number.parseInt(process.env.WINDOWS_CLIENT_ACTION_TIMEOUT_MS ?? '120000', 10);

async function ensureFreshElectronDist() {
  const freshness = inspectElectronDistFreshness({ repoRoot });
  if (freshness.ok) {
    console.log(`[windows-preview-native] electron runtime output fresh checked_sources=${freshness.checkedSourceCount}`);
    return;
  }
  const compile = npmRunCommand('electron:compile');
  await runChecked(compile.command, compile.args, 'compile stale electron runtime output', repoRoot);
}

async function verifyNativeAbi() {
  await ensureElectronNativeAbi({ nativeAbiScript, repoRoot });
}

async function runClientAction(action) {
  const result = await runCapture(process.execPath, [clientScript, action], { timeoutMs: CLIENT_ACTION_TIMEOUT_MS });
  const output = `${result.stdout}${result.stderr}`;
  if (output.trim()) {
    console.log(output.trim());
  }
  return { ...result, output };
}

async function runDirectRestart(reason) {
  console.log('[windows-preview-native] selected action: direct-restart');
  console.log(`[windows-preview-native] reason: ${reason}`);
  const result = await runClientAction('restart');
  const trusted = await waitForTrustedRunningResult('direct restart status');
  if (
    !trusted.ok &&
    (result.code !== 0 || !/(status:\s*(STARTED|RUNNING|RESTARTED))/u.test(result.output))
  ) {
    throw new Error(formatPreviewActionFailure('direct restart', result, trusted));
  }
}

async function readDeliveryPayload(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function waitForDelivery(filePath, intent, label) {
  const deadline = Date.now() + PREVIEW_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (isMatchingPreviewDelivery(await readDeliveryPayload(filePath), intent)) {
      console.log(`[windows-preview-native] ${label} delivery acknowledged nonce=${intent.nonce}`);
      return true;
    }
    await wait(500);
  }
  return false;
}

async function waitForTrustedRunningResult(label, expectedHead = '') {
  const deadline = Date.now() + PREVIEW_TIMEOUT_MS;
  let latestDetail = '';
  while (Date.now() < deadline) {
    const status = await runCapture(process.execPath, [clientScript, 'status']);
    const parsed = parseWindowsClientStatus(`${status.stdout}${status.stderr}`);
    latestDetail = parsed.detail || `${status.stdout}${status.stderr}`.split(/\r?\n/u).filter(Boolean).slice(-5).join('\n');
    if (isTrustedRunningStatus(parsed, { expectedHead })) {
      console.log(`[windows-preview-native] ${label}: ${parsed.detail}`);
      return { detail: parsed.detail, ok: true };
    }
    await wait(1000);
  }
  return { detail: latestDetail, ok: false };
}

async function waitForTrustedRunning(label, expectedHead = '') {
  return (await waitForTrustedRunningResult(label, expectedHead)).ok;
}

async function waitForRendererReloadReady(intent) {
  const deadline = Date.now() + PREVIEW_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [appReady, status] = await Promise.all([
      readDeliveryPayload(appReadyFile),
      runCapture(process.execPath, [clientScript, 'status'])
    ]);
    const parsed = parseWindowsClientStatus(`${status.stdout}${status.stderr}`);
    if (isBootEventAfterIntent(appReady, intent) && isTrustedRunningStatus(parsed)) {
      console.log(`[windows-preview-native] renderer reload status: ${parsed.detail}`);
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
  if (!await waitForDelivery(deliveryPath, result.intent, label)) {
    console.log(`[windows-preview-native] ${label} delivery timed out nonce=${result.intent.nonce}`);
    if (action === 'restart-intent') {
      console.log('[windows-preview-native] restart delivery missing after intent request; falling back to direct restart');
      await runDirectRestart('restart delivery missing after intent request');
      return;
    }
    throw new Error(`${label} delivery timed out nonce=${result.intent.nonce}`);
  }
  if (action === 'renderer-reload-intent') {
    if (!await waitForRendererReloadReady(result.intent)) {
      throw new Error(`${label} did not reach app_ready after reload`);
    }
    return;
  }
  if (!await waitForTrustedRunning(`${label} status`, currentHead)) {
    console.log('[windows-preview-native] restart markers missing after intent delivery; falling back to direct restart');
    await runDirectRestart('restart markers missing after intent delivery');
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
  const trusted = await waitForTrustedRunningResult(`${action} status`, currentHead);
  if (
    !trusted.ok &&
    (result.code !== 0 || !/(status:\s*(STARTED|RUNNING|RESTARTED))/u.test(result.output))
  ) {
    throw new Error(formatPreviewActionFailure(action, result, trusted));
  }
  return 'STARTED';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log('[windows-preview-native] step 1/4: verify electron runtime output freshness');
  await ensureFreshElectronDist();
  console.log('[windows-preview-native] step 2/4: verify Windows-native dependencies');
  await ensureWindowsNativeDependencies({ repoRoot });
  await verifyNativeAbi();
  console.log('[windows-preview-native] step 3/4: select update action');
  const [currentHead, changedFiles, statusResult] = await Promise.all([
    resolveCurrentHead(repoRoot),
    resolveChangedFiles(repoRoot, TARGET_PATHS.windows),
    runClientAction('status')
  ]);
  const status = parseWindowsClientStatus(statusResult.output);
  const committedFilesSinceRuntime = await resolveCommittedFilesSince(repoRoot, status.head, currentHead);
  const selection = selectNativePreviewActionWithCommittedFiles({
    changedFiles,
    committedFilesSinceRuntime,
    currentHead,
    status
  });
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
