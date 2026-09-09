import fs from 'node:fs';
import path from 'node:path';

import { macosA5GradleEnv, macosA5Paths, A5_SERIAL } from '../android/macos-a5-dev.mjs';
import { runMacosA5SyncGroupApproval } from '../android/macos-a5-sync-group-approval.mjs';
import { openMacosSyncGroupDesktopSession } from '../android/macos-sync-group-desktop-session.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import {
  proveABConvergence, waitForAndroidJourneyFact
} from './multi-device-sync-ab-convergence.mjs';
import { establishFreshAB } from './multi-device-sync-fresh-join.mjs';
import { proveALeave } from './multi-device-sync-a-leave.mjs';
import {
  proveARejoin, restartARejoinAndroidProvider
} from './multi-device-sync-a-rejoin.mjs';
import { proveSyncFromZero } from './multi-device-sync-from-zero.mjs';
import { proveParticipationControl } from './multi-device-sync-participation.mjs';
import {
  assertAdmittedMembersRestartedTogether, assertWindowsNonemptyAdmissionReceipt,
  writeNonemptyAdmissionMaterial
} from './multi-device-sync-nonempty-admission-proof.mjs';
import { createActionExecutor } from './multi-device-sync-action-executor.mjs';
import { createApprovalReceiptRelease } from './multi-device-sync-approval-release.mjs';
import { runMacosA5SyncGroupMaintenance } from './a5-sync-group-action.mjs';
import { prepareCandidateStage } from './multi-device-sync-candidate-preparation.mjs';
import { runAOfflineAdmissionPrelude } from './multi-device-sync-fact-preparation.mjs';
import { startWindowsSyncGroupProvider } from './multi-device-sync-windows-provider.mjs';
import { macosAcceptanceEnv, macosAcceptanceSessionOptions } from './multi-device-sync-macos-channel.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';
import { MULTI_DEVICE_ANDROID_APP_ID } from './multi-device-sync-android-profile.mjs';
import { observeMacosAnchorAfterElection } from '../android/macos-a5-anchor-observation.mjs';

/* global AbortController, AbortSignal */

function actionExecute(evidenceRoot, signal, stage) {
  const execute = createActionExecutor({ logPath: path.join(evidenceRoot, 'action.log'),
    progressPath: path.join(evidenceRoot, 'progress.jsonl') });
  return (command, args, options = {}) => execute(command, args, {
    action: options.action || path.basename(command), hardDeadlineMs: options.timeoutMs,
    host: options.host || stage.host, ...options, signal, stage: stage.name
  });
}

export function windowsJoinFailure(result) {
  const output = `${result.stderr || ''}${result.stdout || ''}`;
  const failureLine = output.split(/\r?\n/u)
    .find((line) => line.includes('[windows-dev-action] failure'));
  const detail = /\bmessage=(.+)$/u.exec(failureLine || '')?.[1]?.trim();
  return Object.assign(new Error(
    `Windows C join action failed${detail ? `: ${detail}` : '.'}`
  ), { executionOwner: 'controller', failureAxis: 'execution', host: 'windows-c',
    missingFact: /native client interactive task did not start/u.test(detail || '')
      ? 'windows_native_interactive_start_failed'
      : result.terminationReason || 'windows_c_sync_receipt', result });
}

export function cancelAdmissionSibling(approvalController, approvalRelease, name, status) {
  if (name !== 'windows-c-join') return;
  if (status === 'rejected') approvalController.abort();
  else if (status === 'fulfilled') void approvalRelease.release();
}

export async function syncAdmittedCToAndroid({
  env, evidenceRoot, execute, factId, paths, runId,
  restartAndroid = restartARejoinAndroidProvider,
  runSyncNow = runMacosA5SyncGroupMaintenance,
  waitForFact = waitForAndroidJourneyFact
}) {
  const sync = await runSyncNow({ action: 'sync-now', buildIdentity: runId, env,
    appId: MULTI_DEVICE_ANDROID_APP_ID,
    evidenceRoot: path.join(evidenceRoot, 'c-sync'), execute, installMain: false,
    observeWhileTransportOpen: () => waitForFact(paths, factId, 'C'),
    paths, serial: A5_SERIAL, transportRequired: false });
  await restartAndroid({ appId: MULTI_DEVICE_ANDROID_APP_ID, env, execute, paths });
  const restarted = await waitForFact(paths, factId, 'C');
  return { restarted, sync };
}

async function admitC(repoRoot, runId, sourceRef, { reportProgress, signal, stage }) {
  const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'runs', runId,
    'b-admit-c');
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
  const env = macosAcceptanceEnv(macosA5GradleEnv());
  const owned = createIsolatedMacosRoot({ repoRoot, runId });
  let windowsProvider;
  let windowsSettled = false;
  try {
    const { approval, windows } = await runAOfflineAdmissionPrelude({
      cancelSiblings: (name, status) => cancelAdmissionSibling(
        approvalController, approvalRelease, name, status
      ),
      createFact: (session) => createDesktopSyncGroupJourneyFact({
        device: 'A', evidenceRoot: path.join(evidenceRoot, 'a-fact'), session
      }),
      openSession: () => openMacosSyncGroupDesktopSession(macosAcceptanceSessionOptions({
        libraryHome: path.join(owned.root, 'library'), repoRoot,
        runtimeRoot: owned.root
      })),
      runApproval: (lifecycle) => runMacosA5SyncGroupApproval({
        appId: MULTI_DEVICE_ANDROID_APP_ID,
        allowControlledCancellation: true, execute, instrumentationExecute: executeApproval,
        ...lifecycle, prepare: () => {}, repoRoot
      }),
      startWindows: async () => {
        windowsProvider = startWindowsSyncGroupProvider({ action: 'multi-device-sync-c',
          execute: executeWindows, repoRoot, sourceRef });
        return { code: 0, factId: await windowsProvider.waitForProgress() };
      },
      reportProgress,
      waitForFact: (factId) => waitForAndroidJourneyFact(paths, factId),
      waitForListener: async (session) => {
        await observeMacosAnchorAfterElection(session);
        return session.load();
      }
    });
    if (!windowsProvider || !windows?.factId) throw windowsJoinFailure({ code: 1 });
    const android = await windowsProvider.raceConsumer(syncAdmittedCToAndroid({
      env, evidenceRoot, execute, factId: windows.factId, paths, runId
    }));
    await windowsProvider.release('consumer_complete');
    const admission = await windowsProvider.finish();
    windowsSettled = true;
    const material = assertWindowsNonemptyAdmissionReceipt(admission.receipt);
    assertAdmittedMembersRestartedTogether(android.restarted, admission.receipt);
    const { evidenceRef } = writeNonemptyAdmissionMaterial(evidenceRoot, admission.receipt);
    reportProgress('c-ordinary-sync-completed');
    return { evidenceRef, lastProgressAt: new Date().toISOString(), approval, material };
  } finally {
    if (windowsProvider && !windowsSettled) await windowsProvider.cancelAndSettle();
  }
}

export function createDiagnosticStageActions({ repoRoot, requiredHosts, runId, sourceRef }) {
  const convergenceRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
    'a-b-convergence');
  const zeroRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
    'sync-from-zero');
  return {
    'admit-c': (context) => admitC(repoRoot, runId, sourceRef, context),
    'establish-a-b': (context) => establishFreshAB({ repoRoot, runId, ...context,
      execute: actionExecute(path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
        'a-b-group-sync'), context.signal, context.stage) }),
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
  return { preservedHostState: true, repoRoot, runId };
}
