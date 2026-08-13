import fs from 'node:fs';
import path from 'node:path';

import { macosA5GradleEnv, macosA5Paths, A5_SERIAL } from '../android/macos-a5-dev.mjs';
import { runMacosA5PairSync } from '../android/macos-a5-pair-sync-action.mjs';
import { runMacosA5SyncGroupApproval } from '../android/macos-a5-sync-group-approval.mjs';
import { openMacosPairSyncDesktopSession } from '../android/macos-pair-sync-desktop-session.mjs';
import { resolveMacosA5PairSyncReadiness } from '../android/macos-a5-product-bootstrap.mjs';
import { runMacosA5SyncGroupMaintenance } from '../android/macos-a5-sync-group-maintenance-action.mjs';
import { validateOwnedDesktopPreflight } from '../windows/windows-pair-sync-desktop-readiness.mjs';
import {
  closePairSyncRecoveryTransport, openPairSyncRecoveryTransport
} from '../windows/windows-a5-pair-sync-recovery-transport.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import {
  proveABConvergence, waitForAndroidJourneyFact
} from './multi-device-sync-ab-convergence.mjs';
import { proveALeave } from './multi-device-sync-a-leave.mjs';
import { proveARejoin } from './multi-device-sync-a-rejoin.mjs';
import { proveSyncFromZero } from './multi-device-sync-from-zero.mjs';
import { proveParticipationControl } from './multi-device-sync-participation.mjs';
import { createActionExecutor } from './multi-device-sync-action-executor.mjs';
import { createApprovalReceiptRelease } from './multi-device-sync-approval-release.mjs';
import { prepareCandidateStage } from './multi-device-sync-candidate-preparation.mjs';
import { runAOfflineAdmissionPrelude } from './multi-device-sync-fact-preparation.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';

/* global AbortController, AbortSignal, process */

function actionExecute(evidenceRoot, signal, stage) {
  const execute = createActionExecutor({ logPath: path.join(evidenceRoot, 'action.log'),
    progressPath: path.join(evidenceRoot, 'progress.jsonl') });
  return (command, args, options = {}) => execute(command, args, {
    action: options.action || path.basename(command), hardDeadlineMs: options.timeoutMs,
    host: options.host || stage.host, ...options, signal, stage: stage.name
  });
}

async function establishAB(repoRoot, runId, { reportProgress, signal, stage }) {
  const owned = createIsolatedMacosRoot({ repoRoot, runId });
  const paths = macosA5Paths(repoRoot);
  const env = macosA5GradleEnv();
  const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'runs', runId,
    'a-b-group-sync');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const logPath = path.join(evidenceRoot, 'action.log');
  const execute = actionExecute(evidenceRoot, signal, stage);
  let lastSuccessfulAction = 'stage_started';
  try {
    await runMacosA5SyncGroupMaintenance({ action: 'clear-app-data', buildIdentity: runId,
      env, evidenceRoot: path.join(evidenceRoot, 'clear-a5'), execute, paths, serial: A5_SERIAL });
    lastSuccessfulAction = 'a5_cleared';
    await runMacosA5SyncGroupMaintenance({ action: 'activate-participation', buildIdentity: runId,
      env, evidenceRoot: path.join(evidenceRoot, 'activate-a5'), execute, paths, serial: A5_SERIAL });
    lastSuccessfulAction = 'a5_participation_activated'; reportProgress('a5-cleared');
    const readiness = resolveMacosA5PairSyncReadiness(paths);
    lastSuccessfulAction = 'a5_pairing_readiness';
    const result = await runMacosA5PairSync({ buildIdentity: runId,
      credentialRepairRequired: readiness.credentialRepairRequired,
      desktopControl: async () => ({ code: 0, output: '' }),
      deviceFingerprint: readiness.deviceIdentityFingerprint, env, evidenceRoot, execute,
      existingPairing: readiness.existingPairing, libraryHome: path.join(owned.root, 'library'),
      paths, remotePeerFingerprint: readiness.remotePeerFingerprint, serial: A5_SERIAL,
      userDataPath: path.join(owned.root, 'user-data'), validateDesktop: validateOwnedDesktopPreflight });
    reportProgress('macos-group-created'); reportProgress('a5-paired'); reportProgress('a-b-synced');
    return { evidenceRef: result.pairSyncRecovery.manifestPath };
  } catch (error) {
    Object.assign(error, { evidenceRef: logPath, host: error.host || 'android-b',
      lastSuccessfulAction, missingFact: error.missingFact || error.stage || 'product_action_receipt' });
    throw error;
  }
}

function windowsFormalReceipt(output, repoRoot) {
  const match = /^\[windows-dev-action\] multi-device-sync-c identity=([A-Za-z0-9.-]{1,96})/mu.exec(output);
  if (!match) throw new Error('Windows C formal action did not report fixed evidence.');
  const evidenceRef = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync',
    'windows-c', match[1], 'multi-device-sync-c-receipt.json');
  if (!fs.existsSync(evidenceRef)) throw new Error('Windows C formal receipt is missing.');
  const receipt = JSON.parse(fs.readFileSync(evidenceRef, 'utf8'));
  if (receipt.resultStatus !== 'success' || receipt.firstFacts?.activeMemberCount !== 3
      || receipt.restartedFacts?.activeMemberCount !== 3) {
    throw Object.assign(new Error('Windows C ordinary sync facts are incomplete.'), {
      failureOwner: 'product', host: 'windows-c', missingFact: 'windows_c_sync_incomplete'
    });
  }
  return evidenceRef;
}

export function windowsJoinFailure(result) {
  const output = `${result.stderr || ''}${result.stdout || ''}`;
  const failureLine = output.split(/\r?\n/u)
    .find((line) => line.includes('[windows-dev-action] failure'));
  const detail = /\bmessage=(.+)$/u.exec(failureLine || '')?.[1]?.trim();
  const nativeStartFailed = /native client interactive task did not start/u.test(detail || '');
  return Object.assign(new Error(
    `Windows C join action failed${detail ? `: ${detail}` : '.'}`
  ), { failureOwner: nativeStartFailed || result.terminationReason ? 'controller' : 'product',
    host: 'windows-c', missingFact: nativeStartFailed
      ? 'windows_native_interactive_start_failed'
      : result.terminationReason || 'windows_c_sync_receipt', result });
}

export function cancelAdmissionSibling(approvalController, approvalRelease, name, status) {
  if (name !== 'windows-c-join') return;
  if (status === 'rejected') approvalController.abort();
  else if (status === 'fulfilled') void approvalRelease.release();
}

async function admitEmptyC(repoRoot, runId, { reportProgress, signal, stage }) {
  const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'runs', runId,
    'b-admit-empty-c');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const approvalController = new AbortController();
  const approvalSignal = AbortSignal.any([signal, approvalController.signal]);
  const approvalRelease = createApprovalReceiptRelease(() => approvalController.abort());
  const execute = actionExecute(evidenceRoot, signal, stage);
  const executeApprovalAction = actionExecute(evidenceRoot, approvalSignal, stage);
  const executeApproval = (command, args, options = {}) => executeApprovalAction(command, args, {
    ...options, onOutput: approvalRelease.capture
  });
  const executeWindows = actionExecute(evidenceRoot, signal, stage);
  const paths = macosA5Paths(repoRoot);
  const env = macosA5GradleEnv();
  const owned = createIsolatedMacosRoot({ repoRoot, runId });
  const runTransport = async (args, stage) => {
    const result = await execute(paths.adb, ['-s', A5_SERIAL, ...args], { env, timeoutMs: 10_000 });
    if (result.code === 0) return result;
    throw Object.assign(new Error(`${stage} failed`), {
      failureOwner: 'controller', host: 'android-b',
      lastSuccessfulAction: 'a_deterministic_fact_created',
      missingFact: 'a5_product_transport_unavailable'
    });
  };
  const { approval, windows } = await runAOfflineAdmissionPrelude({
    cancelSiblings: (name, status) => cancelAdmissionSibling(
      approvalController, approvalRelease, name, status
    ),
    closeTransport: () => closePairSyncRecoveryTransport(runTransport),
    createFact: (session) => createDesktopSyncGroupJourneyFact({
      device: 'A', evidenceRoot: path.join(evidenceRoot, 'a-fact'), session
    }),
    openSession: () => openMacosPairSyncDesktopSession({
      libraryHome: path.join(owned.root, 'library'), repoRoot,
      userDataPath: path.join(owned.root, 'user-data')
    }),
    openTransport: () => openPairSyncRecoveryTransport(runTransport),
    runApproval: (lifecycle) => runMacosA5SyncGroupApproval({
      allowControlledCancellation: true, execute, instrumentationExecute: executeApproval,
      ...lifecycle, prepare: () => {}, repoRoot
    }),
    startWindows: async () => {
      const result = await executeWindows(process.execPath,
        ['scripts/windows/windows-dev-control.mjs', 'multi-device-sync-c'], {
        action: 'windows-c-join', cwd: repoRoot, host: 'windows-c', timeoutMs: 15 * 60_000
        });
      if (result.code === 0) return result;
      throw windowsJoinFailure(result);
    },
    reportProgress,
    waitForFact: (factId) => waitForAndroidJourneyFact(paths, factId)
  });
  if (!windows || windows.code !== 0) {
    throw Object.assign(new Error('Windows C ordinary sync failed.'), { evidenceRef: evidenceRoot,
      failureOwner: 'product', host: 'windows-c', missingFact: 'windows_c_sync_receipt' });
  }
  const evidenceRef = windowsFormalReceipt(windows.output, repoRoot);
  reportProgress('c-ordinary-sync-completed');
  return { evidenceRef, lastProgressAt: new Date().toISOString(), approval };
}

export function createDiagnosticStageActions({ repoRoot, requiredHosts, runId }) {
  const convergenceRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
    'a-b-convergence');
  const zeroRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
    'sync-from-zero');
  return {
    'admit-empty-c': (context) => admitEmptyC(repoRoot, runId, context),
    'establish-a-b': (context) => establishAB(repoRoot, runId, context),
    'prepare-candidate': (context) => prepareCandidateStage({
      ...context, repoRoot, requiredHosts, runId
    }),
    'prove-a-b-convergence': (context) => proveABConvergence({ repoRoot, runId,
      execute: actionExecute(convergenceRoot, context.signal, context.stage),
      reportProgress: context.reportProgress }),
    'prove-sync-from-zero': (context) => proveSyncFromZero({ repoRoot, runId, ...context,
      createExecute: (signal, onOutput) => {
        const execute = actionExecute(zeroRoot, signal, context.stage);
        return (command, args, options = {}) => execute(command, args, { ...options, onOutput });
      }, execute: actionExecute(zeroRoot, context.signal, context.stage) }),
    'set-participation': (context) => proveParticipationControl({ repoRoot, runId,
      execute: actionExecute(path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
        'participation-control'), context.signal, context.stage),
      reportProgress: context.reportProgress }),
    'leave-a': (context) => proveALeave({ repoRoot, runId,
      execute: actionExecute(path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
        'a-leave'), context.signal, context.stage), reportActivity: context.reportActivity,
      reportProgress: context.reportProgress }),
    'rejoin-a': (context) => proveARejoin({ repoRoot, runId,
      execute: actionExecute(path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
        'a-rejoin'), context.signal, context.stage), reportActivity: context.reportActivity,
      reportProgress: context.reportProgress })
  };
}

export async function cleanupDiagnosticState({ repoRoot, runId }) {
  const paths = macosA5Paths(repoRoot);
  const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts',
    'multi-device-sync', 'cleanup', runId);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  await runMacosA5SyncGroupMaintenance({ action: 'clear-app-data', buildIdentity: runId,
    env: macosA5GradleEnv(), evidenceRoot,
    execute: actionExecute(evidenceRoot, undefined, { host: 'android-b', name: 'cleanup' }),
    paths, serial: A5_SERIAL });
}
