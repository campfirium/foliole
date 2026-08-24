import fs from 'node:fs';
import path from 'node:path';

import { macosA5GradleEnv, macosA5Paths, A5_SERIAL } from '../android/macos-a5-dev.mjs';
import {
  runMacosA5SyncGroupApproval, startMacosA5SyncGroupApprovalProvider,
  stopMacosA5SyncGroupApprovalProvider
} from '../android/macos-a5-sync-group-approval.mjs';
import { openMacosPairSyncDesktopSession } from '../android/macos-pair-sync-desktop-session.mjs';
import { createSyncFromZeroDataset } from '../desktop/sync-from-zero-dataset-action.mjs';
import { proveARejoin } from './multi-device-sync-a-rejoin.mjs';
import { createApprovalReceiptRelease } from './multi-device-sync-approval-release.mjs';
import {
  assertSyncFromZeroFinalProof, inspectMacosSyncFromZeroDataset,
  waitForAndroidSyncFromZeroDataset, waitForAndroidSyncFromZeroProofSnapshot
} from './multi-device-sync-from-zero-evidence.mjs';
import { settleSiblingActions } from './multi-device-sync-stage-runtime.mjs';
import {
  closeMacosAcceptanceTransport, macosAcceptanceEnv, macosAcceptanceSessionOptions,
  openMacosAcceptanceTransport
} from './multi-device-sync-macos-channel.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';
import {
  assertSyncFromZeroCursorContinuity, assertSyncFromZeroDatasetFacts,
  WINDOWS_SYNC_FROM_ZERO_PROGRESS
} from './sync-from-zero-contract.mjs';

/* global AbortController, AbortSignal, process */

function productFailure(host, missingFact, message) {
  return Object.assign(new Error(message), { failureOwner: 'product', host, missingFact });
}

async function checked(execute, command, args, options, missingFact) {
  const result = await execute(command, args, options);
  if (result.code === 0) return result;
  throw Object.assign(new Error(`${missingFact} failed`), {
    failureOwner: 'controller', host: 'android-b', missingFact, result
  });
}

function windowsEvidence(output, repoRoot) {
  const match = /^\[windows-dev-action\] multi-device-sync-from-zero identity=([A-Za-z0-9.-]{1,96})/mu
    .exec(output);
  if (!match) throw productFailure('windows-c', 'windows_sync_from_zero_receipt_missing',
    'Windows C did not report fixed sync-from-zero evidence.');
  const evidenceRef = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/windows-c',
    match[1], 'multi-device-sync-from-zero-receipt.json');
  if (!fs.existsSync(evidenceRef)) throw productFailure('windows-c',
    'windows_sync_from_zero_receipt_missing', 'Windows C sync-from-zero receipt was not copied.');
  const receipt = JSON.parse(fs.readFileSync(evidenceRef, 'utf8'));
  assertSyncFromZeroCursorContinuity(receipt);
  assertSyncFromZeroDatasetFacts(receipt.finalFacts);
  return { evidenceRef, receipt };
}

function windowsProgressCapture(reportActivity) {
  const allowed = new Set(WINDOWS_SYNC_FROM_ZERO_PROGRESS);
  const seen = new Set();
  let buffered = '';
  return ({ stream, text }) => {
    if (stream !== 'stdout') return;
    buffered += text;
    const lines = buffered.split(/\r?\n/u);
    buffered = lines.pop() ?? '';
    for (const line of lines) {
      const match = /action=multi-device-sync-from-zero .* milestone=([a-z-]+)/u.exec(line);
      const milestone = match?.[1];
      if (!milestone || !allowed.has(milestone) || seen.has(milestone)) continue;
      seen.add(milestone);
      const activity = milestone.includes('content') || milestone.includes('attachment')
        ? 'windows-resource-progress'
        : milestone.includes('cursor') || milestone.includes('interruption')
          ? 'windows-cursor-progress' : 'windows-join-progress';
      reportActivity(activity);
    }
  };
}

async function syncDatasetToAndroid(context) {
  await stopMacosA5SyncGroupApprovalProvider(context);
  context.reportProgress('b-provider-stopped');
  await openMacosAcceptanceTransport(context.runTransport);
  context.transportOpen = true;
  context.reportProgress('b-transport-ready');
  await startMacosA5SyncGroupApprovalProvider({
    ...context, onProviderStopped: async () => {}, onReady: async () => {}
  });
  const snapshot = await waitForAndroidSyncFromZeroDataset(
    context.paths, context.reportActivity, context.reportProgress
  );
  await closeMacosAcceptanceTransport(context.runTransport);
  context.transportOpen = false;
  await stopMacosA5SyncGroupApprovalProvider(context);
  return snapshot;
}

async function admitWindowsFromZero(context) {
  const approvalController = new AbortController();
  const approvalSignal = AbortSignal.any([context.signal, approvalController.signal]);
  const approvalRelease = createApprovalReceiptRelease(() => approvalController.abort());
  const instrumentationExecute = context.createExecute(approvalSignal, approvalRelease.capture);
  let windowsWork;
  let windowsStarted;
  const started = new Promise((resolve) => { windowsStarted = resolve; });
  const runWindows = () => context.execute(process.execPath,
    ['scripts/windows/windows-dev-control.mjs', 'multi-device-sync-from-zero'], {
      action: 'windows-c-sync-from-zero', cwd: context.repoRoot, host: 'windows-c',
      onOutput: windowsProgressCapture(context.reportActivity), timeoutMs: 15 * 60_000
    });
  const approvalWork = runMacosA5SyncGroupApproval({ allowControlledCancellation: true,
    execute: context.execute, instrumentationExecute, prepare: () => {}, repoRoot: context.repoRoot,
    onProviderStopped: async () => {}, onReady: async () => {
      windowsWork = runWindows(); context.reportProgress('windows-join-started'); windowsStarted();
    } });
  const first = await Promise.race([approvalWork.then(() => 'approval'), started.then(() => 'windows')]);
  if (first === 'approval' && !windowsWork) throw productFailure('android-b',
    'windows_c_join_not_started', 'Android approval completed before Windows C started.');
  const settled = await settleSiblingActions([
    { name: 'android-b-approval', work: approvalWork },
    { name: 'windows-c-join', work: windowsWork.then((result) => {
      if (result.code !== 0) throw productFailure('windows-c', 'windows_sync_from_zero_failed',
        'Windows C sync-from-zero action failed.');
      return result;
    }) }
  ], (name, status) => {
    if (name !== 'windows-c-join') return;
    if (status === 'rejected') approvalController.abort();
    else void approvalRelease.release();
  }, ['windows-c-join']);
  context.reportProgress('android-approval-completed');
  return windowsEvidence(settled['windows-c-join'].output, context.repoRoot);
}

function createContext(options) {
  const owned = createIsolatedMacosRoot(options);
  const paths = macosA5Paths(options.repoRoot);
  const env = macosAcceptanceEnv(macosA5GradleEnv());
  const evidenceRoot = path.join(options.repoRoot, '.tmp/artifacts/multi-device-sync/runs',
    options.runId, 'sync-from-zero');
  const runTransport = (args, stage) => checked(options.execute, paths.adb,
    ['-s', A5_SERIAL, ...args], { env, timeoutMs: 30_000 }, stage);
  return { ...options, env, evidenceRoot, owned, paths, runTransport, transportOpen: false };
}

export async function proveSyncFromZero(options) {
  const context = createContext(options);
  fs.mkdirSync(context.evidenceRoot, { recursive: true });
  let session = await openMacosPairSyncDesktopSession(macosAcceptanceSessionOptions({
    libraryHome: path.join(context.owned.root, 'library'), repoRoot: context.repoRoot,
    runtimeRoot: context.owned.root
  }));
  try {
    const overview = await session.enable();
    if (overview.sync_group?.members.filter(({ state }) => state === 'active').length !== 2) {
      throw productFailure('macos-a', 'a_b_group_input_missing', 'A/B Sync Group input is missing.');
    }
    const datasetReceipt = await createSyncFromZeroDataset({
      evidenceRoot: path.join(context.evidenceRoot, 'dataset'),
      onProgress: () => context.reportActivity('dataset-mutation-progress'), session
    });
    context.reportProgress('dataset-created');
    await syncDatasetToAndroid(context);
    await session.close(); session = null; context.reportProgress('macos-offline');
    const windows = await admitWindowsFromZero(context);
    context.reportProgress('windows-cursor-resumed');
    context.reportProgress('windows-structure-batches-complete');
    context.reportProgress('windows-content-batches-complete');
    context.reportProgress('windows-attachment-batches-complete');
    const androidAfterC = await waitForAndroidSyncFromZeroProofSnapshot(context.paths);
    const rejoin = await proveARejoin({ execute: context.execute, repoRoot: context.repoRoot,
      runId: context.runId,
      reportActivity: () => context.reportActivity('three-host-rejoin-progress'),
      reportProgress: () => context.reportActivity('three-host-rejoin-progress') });
    context.reportProgress('three-host-converged');
    session = await openMacosPairSyncDesktopSession(macosAcceptanceSessionOptions({
      libraryHome: path.join(context.owned.root, 'library'), repoRoot: context.repoRoot,
      runtimeRoot: context.owned.root
    }));
    const macos = await inspectMacosSyncFromZeroDataset(session, datasetReceipt);
    const androidFinal = await waitForAndroidSyncFromZeroProofSnapshot(context.paths, {
      includeAttachments: true
    });
    const proof = assertSyncFromZeroFinalProof({ androidAfterC, androidFinal,
      datasetReceipt, macos, runId: context.runId, windowsReceipt: windows.receipt });
    context.reportProgress('provider-resources-preserved');
    context.reportProgress('peer-progress-converged');
    const evidenceRef = path.join(context.evidenceRoot, 'sync-from-zero-proof.json');
    fs.writeFileSync(evidenceRef, `${JSON.stringify({ completedAt: new Date().toISOString(),
      datasetEvidenceRef: datasetReceipt.receiptPath, proof, rejoinEvidenceRef: rejoin.evidenceRef,
      resultStatus: 'success', schemaVersion: 1, windowsEvidenceRef: windows.evidenceRef
    }, null, 2)}\n`, 'utf8');
    return { evidenceRef };
  } finally {
    if (context.transportOpen) await closeMacosAcceptanceTransport(context.runTransport).catch(() => undefined);
    await session?.close().catch(() => undefined);
  }
}
