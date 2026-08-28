#!/usr/bin/env node
/* global console, process */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { executeBounded } from './windows-bounded-process.mjs';
import { prepareWindowsAndroidDebugHost } from './windows-android-host-prepare.mjs';
import { currentAcceptanceCandidate } from '../sync-group/multi-device-sync-candidate.mjs';
import { normalizeWindowsDevAction } from './windows-dev-action-contract.mjs';
import {
  formatWindowsDevFailure, verifyWindowsDevSigningIdentity, windowsDevFailure
} from './windows-dev-build-support.mjs';
import { runWindowsDevDesktopBuild } from './windows-dev-desktop-build.mjs';
import { WINDOWS_DEV_BUILD_ACTIONS } from './windows-dev-build-actions.mjs';
import { runWindowsDevGradleBuild } from './windows-dev-gradle-build.mjs';
import {
  runWindowsFrozenRevisionPreflight, windowsFrozenAttemptId
} from './windows-frozen-revision-preflight.mjs';
import { runWindowsDevDeviceAction } from './windows-dev-device-action.mjs';
import { windowsDevPaths } from './windows-dev-paths.mjs';
import {
  allowsSyncGroupNativeClient, requireTrustedNativeClient
} from './windows-dev-residual-process.mjs';
import { runWindowsDeviceProfileAcceptance } from './windows-device-profile-action.mjs';
import {
  runWindowsSyncGroupJoinPrepareAcceptance
} from './windows-sync-group-join-prepare-action.mjs';
import {
  attachSyncGroupResult, isWindowsSyncGroupAction, preparesWindowsSyncGroupCandidate, printSyncGroupResult,
} from './windows-sync-group-build-routing.mjs';


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

export { formatWindowsDevFailure } from './windows-dev-build-support.mjs';

export async function runWindowsDevBuild({
  action: requestedAction = 'build', deviceAction = runWindowsDevDeviceAction, execute = executeBounded,
  fsApi = fs, id = randomUUID, inspectCandidate = currentAcceptanceCandidate,
  now = () => new Date(), paths = windowsDevPaths(),
  platform = process.platform, prepareHost = prepareWindowsAndroidDebugHost
} = {}) {
  const action = normalizeWindowsDevAction(requestedAction);
  const startedAt = now().toISOString();
  let context;
  let directChildPid = null;
  try {
    if (platform !== 'win32') throw failure('Windows DEV action requires Windows', 64, 'platform');
    if (!WINDOWS_DEV_BUILD_ACTIONS.includes(action)) throw failure('Unknown Windows DEV action', 64, 'request');
    context = evidenceContext(paths, now, id, fsApi);
    const requiredTools = [paths.systemNode,
      ...(['build', 'capture-annotation', 'deploy'].includes(action)
        || action === 'device-profile' || action === 'sync-group-join-prepare'
        || ['single-principal-sync-group', 'two-device-sync-provider'].includes(action)
        || preparesWindowsSyncGroupCandidate(action)
        || action === 'frozen-revision-preflight' ? [paths.systemNpmCli] : []),
      ...(action === 'frozen-revision-preflight' ? [paths.gitPath, paths.tarPath] : []),
      ...(['build', 'device-profile', 'frozen-revision-preflight', 'sync-group-join-prepare'].includes(action)
        || isWindowsSyncGroupAction(action) ? [] : [paths.adbPath])];
    for (const filePath of requiredTools) {
      if (!fsApi.existsSync(filePath)) throw failure(`Required tool is missing: ${filePath}`, 64, 'preflight');
    }
    const residualBefore = await snapshotProcesses(execute, paths);
    if (residualBefore.length > 0 && !allowsSyncGroupNativeClient(action, residualBefore, paths)) {
      throw failure('Repository-owned action process is already running', 73, 'residual');
    }
    const trustedRuntime = action === 'frozen-revision-preflight'
      ? requireTrustedNativeClient(residualBefore, paths) : null;
    const signing = action === 'frozen-revision-preflight'
      ? { sha256: null } : verifyWindowsDevSigningIdentity(paths, fsApi);
    const candidate = preparesWindowsSyncGroupCandidate(action)
      ? inspectCandidate(paths.repoRoot, 'diagnostic') : null;
    if (candidate && !candidate.clean) {
      throw failure('Windows candidate requires clean source before host preparation', 64, 'candidate');
    }
    let output = '';
    let readiness = null;
    if (action === 'capture-annotation') {
      const gate = await deviceAction({
        action, buildIdentity: context.runId, evidenceRoot: context.root, execute, paths,
        phase: 'readiness'
      });
      readiness = gate.captureAnnotationReadiness;
      output += gate.output;
    }
    if (['build', 'capture-annotation', 'deploy'].includes(action)
        || preparesWindowsSyncGroupCandidate(action)) {
      output += await prepareHost({
        execute, fsApi, liveReload: action !== 'capture-annotation'
          && !isWindowsSyncGroupAction(action), paths
      });
    }
    if (['device-profile', 'sync-group-join-prepare', 'single-principal-sync-group',
      'two-device-sync-provider'].includes(action)
        || preparesWindowsSyncGroupCandidate(action)) {
      output += await runWindowsDevDesktopBuild(execute, paths, checked);
    }
    let actionResult = null;
    if (action === 'frozen-revision-preflight') {
      const preflight = await runWindowsFrozenRevisionPreflight({
        attemptId: windowsFrozenAttemptId(context.runId),
        evidenceRoot: path.join(context.root, 'frozen-revision-preflight'), execute, fsApi, paths,
        snapshotRuntime: () => snapshotProcesses(execute, paths), trustedRuntime
      });
      output += preflight.output;
      actionResult = { frozenRevisionPreflight: preflight };
    }
    if (['build', 'capture-annotation'].includes(action)) {
      const build = await runWindowsDevGradleBuild(execute, paths, platform, action);
      directChildPid = build.directChildPid;
      output += build.output;
    }
    const desktopDeviceProfile = await runWindowsDeviceProfileAcceptance(action, execute, paths);
    const desktopJoinPrepare = await runWindowsSyncGroupJoinPrepareAcceptance(
      action, execute, paths, context.root
    );
    if (desktopJoinPrepare) {
      output += desktopJoinPrepare.output;
      actionResult = { desktopSyncGroupJoinPrepare: desktopJoinPrepare.evidence };
    } else if (desktopDeviceProfile) {
      output += desktopDeviceProfile.output;
      actionResult = { desktopDeviceProfile: desktopDeviceProfile.evidence };
    } else if (!['build', 'frozen-revision-preflight'].includes(action)) {
      actionResult = await deviceAction({
        action, buildIdentity: context.runId, evidenceRoot: context.root, execute, paths,
        ...(candidate ? { candidate } : {}),
        phase: 'execute'
      });
      output += actionResult.output;
    }
    fsApi.writeFileSync(context.logPath, output, 'utf8');
    const summary = { action, completedAt: now().toISOString(), directChildPid,
      exitCode: 0,
      logPath: context.logPath, repoRoot: paths.repoRoot,
      resultStatus: 'success', runId: context.runId, schemaVersion: 1, signingSha256: signing.sha256,
      startedAt, ...(readiness ? {
        captureAnnotationReadiness: readiness
      } : {}),
      ...(actionResult?.liveReload ? { liveReload: actionResult.liveReload } : {}) };
    if (actionResult?.captureAnnotation) summary.captureAnnotation = actionResult.captureAnnotation;
    if (actionResult?.desktopDeviceProfile) summary.desktopDeviceProfile = actionResult.desktopDeviceProfile;
    if (actionResult?.desktopSyncGroupJoinPrepare) {
      summary.desktopSyncGroupJoinPrepare = actionResult.desktopSyncGroupJoinPrepare;
    }
    if (actionResult?.frozenRevisionPreflight) {
      summary.frozenRevisionPreflight = actionResult.frozenRevisionPreflight;
    }
    attachSyncGroupResult(summary, actionResult);
    writeJson(fsApi, context.summaryPath, summary);
    return { exitCode: 0, summary, summaryPath: context.summaryPath };
  } catch (error) {
    const exitCode = error.exitCode || 125;
    if (context && error.result?.output && !fsApi.existsSync(context.logPath)) {
      fsApi.writeFileSync(context.logPath, error.result.output, 'utf8');
    }
    const summary = { action, completedAt: now().toISOString(), directChildPid, exitCode,
      failureStage: error.stage || 'entry',
      message: error.message,
      resultStatus: error.resultStatus || 'failure',
      runId: context?.runId ?? null, schemaVersion: 1, startedAt,
      ...(error.receiptPath ? { frozenRevisionPreflight: { receiptPath: error.receiptPath } } : {}),
      ...(error.readiness ? {
        captureAnnotationReadiness: error.readiness
      } : {}),
      ...(error.liveReload ? { liveReload: error.liveReload } : {}) };
    if (error.failureReason) summary.failureReason = error.failureReason;
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
  if (result.summary.frozenRevisionPreflight) {
    const preflight = result.summary.frozenRevisionPreflight;
    stream(`[windows-dev-action] frozen-revision-preflight identity=${preflight.receipt?.attemptId ?? result.summary.runId} receipt=${preflight.receiptPath}`);
  }
  printSyncGroupResult(stream, result.summary);
  stream(`[windows-dev-action] status: ${label} exit=${result.exitCode} evidence=${result.summaryPath ?? '-'}`);
  process.exitCode = result.exitCode;
}
