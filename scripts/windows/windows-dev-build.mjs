#!/usr/bin/env node
/* global console, process */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { executeBounded } from './windows-bounded-process.mjs';
import { prepareWindowsAndroidDebugHost } from './windows-android-host-prepare.mjs';
import { sanitizePairSyncRecoveryFailureEvidence } from '../sync-group/pair-sync-failure-evidence.mjs';
import { sanitizePairSyncRecoveryProgressEvidence } from '../sync-group/pair-sync-feature-result.mjs';
import { normalizeWindowsDevAction } from './windows-dev-action-contract.mjs';
import {
  formatWindowsDevFailure, verifyWindowsDevSigningIdentity, windowsDevFailure
} from './windows-dev-build-support.mjs';
import { runWindowsDevDesktopBuild } from './windows-dev-desktop-build.mjs';
import { runWindowsDevDeviceAction } from './windows-dev-device-action.mjs';
import { windowsDevPaths } from './windows-dev-paths.mjs';
import { allowsPairSyncNativeClient } from './windows-dev-residual-process.mjs';
import { runWindowsDeviceProfileAcceptance } from './windows-device-profile-action.mjs';
import {
  attachSyncGroupResult, isWindowsSyncGroupAction, preparesWindowsSyncGroupCandidate, printSyncGroupResult,
  WINDOWS_SYNC_GROUP_ACTIONS
} from './windows-sync-group-build-routing.mjs';

const BUILD_COMMAND = 'call .\\gradlew.bat --no-daemon assembleDebugAndroidTest';
const CAPTURE_BUILD_COMMAND = 'call .\\gradlew.bat --no-daemon assembleDebug assembleDebugAndroidTest';
const BUILD_TIMEOUT_MS = 20 * 60_000;
const WINDOWS_DEV_ACTIONS = [
  'appearance', 'build', 'capture-annotation', 'deploy', 'device-profile', 'live', 'pair-sync-recover', 'secondary',
  ...WINDOWS_SYNC_GROUP_ACTIONS, 'verify'
];

function parseJson(text, label) {
  try { return JSON.parse(text.replace(/^\uFEFF/u, '')); }
  catch { throw failure(`${label} is not valid JSON`, 64, 'preflight'); }
}

const failure = windowsDevFailure;

async function checked(execute, command, args, options, stage, exitCode = 74) {
  const result = await execute(command, args, options);
  if (result.code !== 0) {
    const detail = result.lines?.at(-1) || result.stderr || `${command} exited ${result.code}`;
    throw Object.assign(failure(String(detail).trim(), exitCode, stage), { result });
  }
  return result;
}

async function snapshotProcesses(execute, paths) {
  const script = path.join(paths.repoRoot, 'scripts', 'windows', 'windows-dev-process-snapshot.ps1');
  const result = await checked(execute, 'powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-RepoRoot', paths.repoRoot
  ], { timeoutCode: 'process_snapshot_timeout', timeoutMs: 30_000, windowsHide: true }, 'process-snapshot');
  const snapshot = parseJson(result.stdout.trim() || '[]', 'process snapshot');
  return Array.isArray(snapshot) ? snapshot : [snapshot];
}

function evidenceContext(paths, now, id, fsApi) {
  const runId = `${now().toISOString().replace(/[-:.TZ]/gu, '')}-${id().slice(0, 8)}`;
  const root = path.join(paths.repoRoot, '.tmp', 'artifacts', 'windows-dev-action', runId);
  fsApi.mkdirSync(root, { recursive: true });
  return { logPath: path.join(root, 'action.log'), root, runId, summaryPath: path.join(root, 'summary.json') };
}

function writeJson(fsApi, filePath, value) {
  fsApi.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function runGradleBuild(execute, paths, platform, command) {
  let directChildPid = null;
  const build = await execute('cmd.exe', ['/d', '/s', '/c', command], {
    cwd: path.join(paths.repoRoot, 'android'),
    env: { ...process.env, ANDROID_HOME: paths.androidSdk, ANDROID_SDK_ROOT: paths.androidSdk,
      ANDROID_USER_HOME: paths.signingHome, JAVA_HOME: paths.javaHome },
    onSpawn: (child) => { directChildPid = child.pid; }, platform,
    timeoutCode: 'build_timeout', timeoutMs: BUILD_TIMEOUT_MS, windowsHide: true
  });
  if (build.code !== 0 || !build.output.includes('BUILD SUCCESSFUL')) {
    throw Object.assign(failure('Gradle did not reach BUILD SUCCESSFUL', 74, 'build'), { result: build });
  }
  return { directChildPid, output: build.output };
}

export { formatWindowsDevFailure } from './windows-dev-build-support.mjs';

export async function runWindowsDevBuild({
  action: requestedAction = 'build', deviceAction = runWindowsDevDeviceAction, execute = executeBounded,
  fsApi = fs, id = randomUUID, now = () => new Date(), paths = windowsDevPaths(),
  platform = process.platform, prepareHost = prepareWindowsAndroidDebugHost
} = {}) {
  const action = normalizeWindowsDevAction(requestedAction);
  const startedAt = now().toISOString();
  let context;
  let directChildPid = null;
  try {
    if (platform !== 'win32') throw failure('Windows DEV action requires Windows', 64, 'platform');
    if (!WINDOWS_DEV_ACTIONS.includes(action)) throw failure('Unknown Windows DEV action', 64, 'request');
    context = evidenceContext(paths, now, id, fsApi);
    const requiredTools = [paths.systemNode,
      ...(['build', 'capture-annotation', 'deploy', 'pair-sync-recover'].includes(action)
        || action === 'device-profile' || preparesWindowsSyncGroupCandidate(action)
        ? [paths.systemNpmCli] : []),
      ...(['build', 'device-profile'].includes(action) || isWindowsSyncGroupAction(action) ? [] : [paths.adbPath])];
    for (const filePath of requiredTools) {
      if (!fsApi.existsSync(filePath)) throw failure(`Required tool is missing: ${filePath}`, 64, 'preflight');
    }
    const residualBefore = await snapshotProcesses(execute, paths);
    if (residualBefore.length > 0 && !allowsPairSyncNativeClient(action, residualBefore, paths)) {
      throw failure('Repository-owned action process is already running', 73, 'residual');
    }
    const signing = verifyWindowsDevSigningIdentity(paths, fsApi);
    let output = '';
    let readiness = null;
    let desktopPairingReadiness = null;
    if (action === 'capture-annotation' || action === 'pair-sync-recover') {
      const gate = await deviceAction({
        action, buildIdentity: context.runId, evidenceRoot: context.root, execute, paths,
        phase: 'readiness'
      });
      readiness = gate.captureAnnotationReadiness ?? gate.pairSyncRecoveryReadiness;
      desktopPairingReadiness = gate.desktopPairingReadiness ?? null;
      output += gate.output;
    }
    if (['build', 'capture-annotation', 'deploy', 'pair-sync-recover'].includes(action)
        || preparesWindowsSyncGroupCandidate(action)) {
      output += await prepareHost({
        execute, fsApi, liveReload: !['capture-annotation', 'pair-sync-recover'].includes(action)
          && !isWindowsSyncGroupAction(action), paths
      });
    }
    if (action === 'pair-sync-recover' || action === 'device-profile'
        || preparesWindowsSyncGroupCandidate(action)) {
      output += await runWindowsDevDesktopBuild(execute, paths, checked);
    }
    let actionResult = null;
    if (['build', 'capture-annotation', 'pair-sync-recover'].includes(action)) {
      const build = await runGradleBuild(
        execute, paths, platform,
        action === 'capture-annotation' || action === 'pair-sync-recover' ? CAPTURE_BUILD_COMMAND : BUILD_COMMAND
      );
      directChildPid = build.directChildPid;
      output += build.output;
    }
    const desktopDeviceProfile = await runWindowsDeviceProfileAcceptance(action, execute, paths);
    if (desktopDeviceProfile) {
      output += desktopDeviceProfile.output;
      actionResult = { desktopDeviceProfile: desktopDeviceProfile.evidence };
    } else if (action !== 'build') {
      actionResult = await deviceAction({
        action, buildIdentity: context.runId, evidenceRoot: context.root, execute, paths,
        pairSyncRecoveryReadiness: action === 'pair-sync-recover' ? readiness : undefined,
        phase: 'execute'
      });
      output += actionResult.output;
    }
    if (action !== 'pair-sync-recover') fsApi.writeFileSync(context.logPath, output, 'utf8');
    const summary = { action, completedAt: now().toISOString(), directChildPid,
      exitCode: 0,
      ...(action === 'pair-sync-recover' ? {} : { logPath: context.logPath, repoRoot: paths.repoRoot }),
      resultStatus: 'success', runId: context.runId, schemaVersion: 1, signingSha256: signing.sha256,
      startedAt, ...(readiness ? {
        [action === 'pair-sync-recover' ? 'pairSyncRecoveryReadiness' : 'captureAnnotationReadiness']: readiness
      } : {}),
      ...(desktopPairingReadiness ? { desktopPairingReadiness } : {}),
      ...(actionResult?.liveReload ? { liveReload: actionResult.liveReload } : {}) };
    if (actionResult?.captureAnnotation) summary.captureAnnotation = actionResult.captureAnnotation;
    if (actionResult?.pairSyncRecovery) summary.pairSyncRecovery = actionResult.pairSyncRecovery;
    if (actionResult?.desktopDeviceProfile) summary.desktopDeviceProfile = actionResult.desktopDeviceProfile;
    attachSyncGroupResult(summary, actionResult);
    writeJson(fsApi, context.summaryPath, summary);
    return { exitCode: 0, summary, summaryPath: context.summaryPath };
  } catch (error) {
    const exitCode = error.exitCode || 125;
    if (action !== 'pair-sync-recover' && context && error.result?.output && !fsApi.existsSync(context.logPath)) {
      fsApi.writeFileSync(context.logPath, error.result.output, 'utf8');
    }
    const summary = { action, completedAt: now().toISOString(), directChildPid, exitCode,
      failureStage: error.stage || 'entry',
      message: action === 'pair-sync-recover' ? 'Pair sync recovery stopped before completion' : error.message,
      resultStatus: error.resultStatus || 'failure',
      runId: context?.runId ?? null, schemaVersion: 1, startedAt,
      ...(error.readiness ? {
        [action === 'pair-sync-recover' ? 'pairSyncRecoveryReadiness' : 'captureAnnotationReadiness']: error.readiness
      } : {}),
      ...(error.liveReload ? { liveReload: error.liveReload } : {}) };
    if (error.failureReason) summary.failureReason = error.failureReason;
    if (error.pairSyncRecoveryEvidence) summary.pairSyncRecoveryEvidence = sanitizePairSyncRecoveryProgressEvidence(error.pairSyncRecoveryEvidence);
    if (error.pairSyncFailureEvidence) {
      summary.pairSyncFailureEvidence = sanitizePairSyncRecoveryFailureEvidence(error.pairSyncFailureEvidence);
    }
    if (context) writeJson(fsApi, context.summaryPath, summary);
    return { exitCode, summary, summaryPath: context?.summaryPath ?? null };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const action = args.length === 0 ? 'build' : args.length === 1 ? args[0] : 'invalid';
  const result = await runWindowsDevBuild({ action });
  const label = result.exitCode === 0 ? 'OK' : 'FAILED';
  const stream = result.exitCode === 0 ? console.log : console.error;
  if (result.exitCode !== 0) stream(formatWindowsDevFailure(result.summary));
  if (result.summary.liveReload) {
    stream(`[windows-dev-action] live identity=${result.summary.liveReload.buildIdentity} screenshot=${result.summary.liveReload.screenshotPath}`);
  }
  if (result.summary.captureAnnotation) {
    stream(`[windows-dev-action] capture-annotation identity=${result.summary.captureAnnotation.buildIdentity} manifest=${result.summary.captureAnnotation.manifestPath}`);
  }
  if (result.summary.pairSyncRecovery) {
    stream(`[windows-dev-action] pair-sync-recover identity=${result.summary.pairSyncRecovery.buildIdentity} manifest=${result.summary.pairSyncRecovery.manifestPath}`);
  }
  printSyncGroupResult(stream, result.summary);
  stream(`[windows-dev-action] status: ${label} exit=${result.exitCode} evidence=${result.summaryPath ?? '-'}`);
  process.exitCode = result.exitCode;
}
