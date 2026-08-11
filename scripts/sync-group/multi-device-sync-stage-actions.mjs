import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

import { inspectPairSyncRecoveryWorkspace } from '../android/android-pair-sync-recovery-readiness.mjs';
import { collectAndroidDeviceSnapshot } from '../android/android-device-snapshot.mjs';
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
import { runAOfflineAdmissionPrelude } from './multi-device-sync-fact-preparation.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';

/* global Buffer, clearTimeout, process, setTimeout */

const exec = promisify(execFile);

function actionExecute(progressPath, logPath) {
  return (command, args, options = {}) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let stderr = ''; let stdout = '';
    const progress = (host, chunk) => {
      const text = chunk.toString(); output += text;
      if (host === 'stdout') stdout += text; else stderr += text;
      if (!fs.existsSync(logPath) || fs.statSync(logPath).size < 64 * 1024 ** 2) {
        fs.appendFileSync(logPath, text.slice(0, 64 * 1024 ** 2), 'utf8');
      }
      fs.appendFileSync(progressPath, `${JSON.stringify({ at: new Date().toISOString(),
        bytes: Buffer.byteLength(text), host })}\n`, 'utf8');
      clearTimeout(stall); stall = setTimeout(() => child.kill('SIGKILL'), 60_000);
    };
    let stall = setTimeout(() => child.kill('SIGKILL'), 60_000);
    child.stdout.on('data', (chunk) => progress('stdout', chunk));
    child.stderr.on('data', (chunk) => progress('stderr', chunk));
    child.on('error', (error) => { clearTimeout(stall); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(stall);
      resolve({ code: signal === 'SIGKILL' ? 124 : code ?? 1,
        lines: output.split(/\r?\n/u).filter(Boolean), output, stderr, stdout });
    });
  });
}

function run(command, args, repoRoot, timeout = 20 * 60_000) {
  return exec(command, args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    timeout });
}

async function prepareCandidate(repoRoot, runId) {
  await run('npm', ['run', 'build'], repoRoot);
  await run('npm', ['run', 'electron:compile'], repoRoot);
  await run(process.execPath, ['scripts/android/macos-a5-dev.mjs', 'build'], repoRoot);
  const paths = macosA5Paths(repoRoot);
  await run(paths.adb, ['-s', A5_SERIAL, 'install', '-r', paths.apk], repoRoot, 5 * 60_000);
  await run(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'force-stop', 'com.foliole.android'], repoRoot, 10_000);
  await run(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'start', '-W', '-n',
    'com.foliole.android/.MainActivity'], repoRoot, 20_000);
  const windows = await run(process.execPath, ['scripts/windows/windows-dev-control.mjs',
    'multi-device-sync-candidate'], repoRoot);
  if (!windows.stdout.includes('[windows-dev-action] multi-device-sync-candidate')) {
    throw Object.assign(new Error('Windows candidate did not report fixed evidence.'), {
      failureOwner: 'candidate', host: 'windows-c', missingFact: 'windows_candidate_unbound'
    });
  }
  const apk = path.join(repoRoot, 'android/app/build/outputs/apk/debug/app-debug.apk');
  const evidenceRef = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'runs', runId,
    'candidate-preparation.json');
  fs.writeFileSync(evidenceRef, `${JSON.stringify({
    androidApkSha256: createHash('sha256').update(fs.readFileSync(apk)).digest('hex'),
    completedAt: new Date().toISOString(), resultStatus: 'success', runId,
    windowsReceipt: windows.stdout.split(/\r?\n/u).find((line) =>
      line.includes('[windows-dev-action] multi-device-sync-candidate'))
  }, null, 2)}\n`, 'utf8');
  return { evidenceRef, progress: ['macos-built', 'a5-built', 'windows-built'] };
}

async function establishAB(repoRoot, runId) {
  const owned = createIsolatedMacosRoot({ repoRoot, runId });
  const paths = macosA5Paths(repoRoot);
  const env = macosA5GradleEnv();
  const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'runs', runId,
    'a-b-group-sync');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const logPath = path.join(evidenceRoot, 'action.log');
  const execute = actionExecute(path.join(evidenceRoot, 'progress.jsonl'), logPath);
  let lastSuccessfulAction = 'stage_started';
  try {
    await runMacosA5SyncGroupMaintenance({ action: 'clear-app-data', buildIdentity: runId,
      env, evidenceRoot: path.join(evidenceRoot, 'clear-a5'), execute, paths, serial: A5_SERIAL });
    lastSuccessfulAction = 'a5_cleared';
    const readiness = resolveMacosA5PairSyncReadiness(paths);
    lastSuccessfulAction = 'a5_pairing_readiness';
    const result = await runMacosA5PairSync({ buildIdentity: runId,
      credentialRepairRequired: readiness.credentialRepairRequired,
      desktopControl: async () => ({ code: 0, output: '' }),
      deviceFingerprint: readiness.deviceIdentityFingerprint, env, evidenceRoot, execute,
      existingPairing: readiness.existingPairing, libraryHome: path.join(owned.root, 'library'),
      paths, remotePeerFingerprint: readiness.remotePeerFingerprint, serial: A5_SERIAL,
      userDataPath: path.join(owned.root, 'user-data'), validateDesktop: validateOwnedDesktopPreflight });
    return { evidenceRef: result.pairSyncRecovery.manifestPath,
      progress: ['a5-cleared', 'macos-group-created', 'a5-paired', 'a-b-synced'] };
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

async function waitForAndroidFact(paths, factId) {
  const deadline = Date.now() + 60_000;
  let snapshot;
  while (Date.now() < deadline) {
    snapshot = await collectAndroidDeviceSnapshot({ adb: paths.adb, appId: 'com.foliole.android',
      databaseInspector: inspectPairSyncRecoveryWorkspace, includeEvents: false,
      serial: A5_SERIAL, tables: ['nodes'] });
    if (snapshot.database?.inspection?.journeyFacts?.[factId] === 'A') return snapshot;
    await delay(1_000);
  }
  throw Object.assign(new Error('Android B did not receive the deterministic A fact.'), {
    failureOwner: 'product', host: 'android-b', missingFact: 'deterministic_a_fact_missing',
    status: 'stalled'
  });
}

async function admitEmptyC(repoRoot, runId) {
  const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'runs', runId,
    'b-admit-empty-c');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const execute = actionExecute(path.join(evidenceRoot, 'progress.jsonl'),
    path.join(evidenceRoot, 'action.log'));
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
      execute, ...lifecycle, prepare: () => {}, repoRoot
    }),
    startWindows: () => execute(process.execPath,
      ['scripts/windows/windows-dev-control.mjs', 'multi-device-sync-c'], { cwd: repoRoot }),
    waitForFact: (factId) => waitForAndroidFact(paths, factId)
  });
  if (!windows || windows.code !== 0) {
    throw Object.assign(new Error('Windows C ordinary sync failed.'), { evidenceRef: evidenceRoot,
      failureOwner: 'product', host: 'windows-c', missingFact: 'windows_c_sync_receipt' });
  }
  const evidenceRef = windowsFormalReceipt(windows.output, repoRoot);
  return { evidenceRef, lastProgressAt: new Date().toISOString(),
    progress: ['a-deterministic-fact-created', 'a-fact-synced-to-b', 'a-offline',
      'c-join-approved', 'c-ordinary-sync-complete',
      `approval-${approval.receipt.targetTestId}`] };
}

export function createDiagnosticStageActions({ repoRoot, runId }) {
  return {
    'admit-empty-c': () => admitEmptyC(repoRoot, runId),
    'establish-a-b': () => establishAB(repoRoot, runId),
    'prepare-candidate': () => prepareCandidate(repoRoot, runId)
  };
}

export async function cleanupDiagnosticState({ repoRoot, runId }) {
  const paths = macosA5Paths(repoRoot);
  const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts',
    'multi-device-sync', 'cleanup', runId);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  await runMacosA5SyncGroupMaintenance({ action: 'clear-app-data', buildIdentity: runId,
    env: macosA5GradleEnv(), evidenceRoot,
    execute: actionExecute(path.join(evidenceRoot, 'progress.jsonl'),
      path.join(evidenceRoot, 'action.log')), paths, serial: A5_SERIAL });
}
