import fs from 'node:fs';
import path from 'node:path';

import { macosA5GradleEnv, macosA5Paths, A5_SERIAL } from '../android/macos-a5-dev.mjs';
import { runMacosA5SyncGroupApproval } from '../android/macos-a5-sync-group-approval.mjs';
import { openMacosPairSyncDesktopSession } from '../android/macos-pair-sync-desktop-session.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import {
  proveABConvergence, waitForAndroidJourneyFact
} from './multi-device-sync-ab-convergence.mjs';
import { establishFreshAB } from './multi-device-sync-fresh-join.mjs';
import { proveALeave } from './multi-device-sync-a-leave.mjs';
import { proveARejoin } from './multi-device-sync-a-rejoin.mjs';
import { proveSyncFromZero } from './multi-device-sync-from-zero.mjs';
import { proveParticipationControl } from './multi-device-sync-participation.mjs';
import {
  assertWindowsNonemptyAdmissionReceipt, writeNonemptyAdmissionMaterial
} from './multi-device-sync-nonempty-admission-proof.mjs';
import { createActionExecutor } from './multi-device-sync-action-executor.mjs';
import { createApprovalReceiptRelease } from './multi-device-sync-approval-release.mjs';
import { prepareCandidateStage } from './multi-device-sync-candidate-preparation.mjs';
import { runAOfflineAdmissionPrelude } from './multi-device-sync-fact-preparation.mjs';
import { startWindowsSyncGroupProvider } from './multi-device-sync-windows-provider.mjs';
import {
  closeMacosAcceptanceTransport, macosAcceptanceEnv, macosAcceptanceSessionOptions,
  openMacosAcceptanceTransport
} from './multi-device-sync-macos-channel.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';

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

export function cancelAdmissionSibling(approvalController, name, status) {
  if (name !== 'windows-c-join') return;
  if (status === 'rejected') approvalController.abort();
}

async function admitC(repoRoot, runId, { reportProgress, signal, stage }) {
  const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'runs', runId,
    'b-admit-c');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const approvalController = new AbortController();
  const approvalSignal = AbortSignal.any([signal, approvalController.signal]);
  const approvalRelease = createApprovalReceiptRelease(() => approvalController.abort());
  const execute = actionExecute(evidenceRoot, signal, stage);
  const executeApprovalAction = actionExecute(evidenceRoot, approvalSignal, stage);
  const executeApproval = (command, args, options = {}) => executeApprovalAction(command, args, {
    ...options, onOutput: (event) => {
      approvalRelease.capture(event); options.onOutput?.(event);
    }
  });
  const executeWindows = actionExecute(evidenceRoot, signal, stage);
  const paths = macosA5Paths(repoRoot);
  const env = macosAcceptanceEnv(macosA5GradleEnv());
  const owned = createIsolatedMacosRoot({ repoRoot, runId });
  const runTransport = async (args, stage) => {
    const result = await execute(paths.adb, ['-s', A5_SERIAL, ...args], { env, timeoutMs: 10_000 });
    if (result.code === 0) return result;
    throw Object.assign(new Error(`${stage} failed`), {
      executionOwner: 'controller', failureAxis: 'execution', host: 'android-b',
      lastSuccessfulAction: 'a_deterministic_fact_created',
      missingFact: 'a5_product_transport_unavailable'
    });
  };
  let windowsProvider;
  let windowsSettled = false;
  try {
    const { approval, windows } = await runAOfflineAdmissionPrelude({
      cancelSiblings: (name, status) => cancelAdmissionSibling(approvalController, name, status),
      closeTransport: () => closeMacosAcceptanceTransport(runTransport),
      createFact: (session) => createDesktopSyncGroupJourneyFact({
        device: 'A', evidenceRoot: path.join(evidenceRoot, 'a-fact'), session
      }),
      completeWindowsAdmission: async (windows) => {
        if (!windowsProvider || !windows?.factId) throw windowsJoinFailure({ code: 1 });
        await windowsProvider.raceConsumer(waitForAndroidJourneyFact(paths, windows.factId, 'C'));
        await approvalRelease.release();
      },
      openSession: () => openMacosPairSyncDesktopSession(macosAcceptanceSessionOptions({
        libraryHome: path.join(owned.root, 'library'), repoRoot,
        runtimeRoot: owned.root
      })),
      openTransport: () => openMacosAcceptanceTransport(runTransport),
      runApproval: (lifecycle) => runMacosA5SyncGroupApproval({
        allowControlledCancellation: true, cancelInstrumentation: () => approvalController.abort(),
        execute, instrumentationExecute: executeApproval,
        ...lifecycle, prepare: () => {}, repoRoot
      }),
      startWindows: async () => {
        windowsProvider = startWindowsSyncGroupProvider({ action: 'multi-device-sync-c',
          execute: executeWindows, repoRoot });
        return { code: 0, factId: await windowsProvider.waitForProgress() };
      },
      reportProgress,
      waitForFact: (factId) => waitForAndroidJourneyFact(paths, factId)
    });
    if (!windowsProvider || !windows?.factId) throw windowsJoinFailure({ code: 1 });
    await windowsProvider.release('consumer_complete');
    const admission = await windowsProvider.finish();
    windowsSettled = true;
    const material = assertWindowsNonemptyAdmissionReceipt(admission.receipt);
    const { evidenceRef } = writeNonemptyAdmissionMaterial(evidenceRoot, admission.receipt);
    reportProgress('c-ordinary-sync-completed');
    return { evidenceRef, lastProgressAt: new Date().toISOString(), approval, material };
  } finally {
    if (windowsProvider && !windowsSettled) await windowsProvider.cancelAndSettle();
  }
}

export function createDiagnosticStageActions({ repoRoot, requiredHosts, runId }) {
  const convergenceRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
    'a-b-convergence');
  const zeroRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
    'sync-from-zero');
  return {
    'admit-c': (context) => admitC(repoRoot, runId, context),
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
