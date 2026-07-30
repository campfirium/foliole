#!/usr/bin/env node
/* global console, process */

import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { executeBounded } from './windows-bounded-process.mjs';
import { prepareWindowsAndroidDebugHost } from './windows-android-host-prepare.mjs';
import { runWindowsDevDeviceAction } from './windows-dev-device-action.mjs';
import { windowsDevPaths } from './windows-dev-paths.mjs';

const BUILD_COMMAND = 'call .\\gradlew.bat --no-daemon assembleDebugAndroidTest';
const BUILD_TIMEOUT_MS = 20 * 60_000;

function failure(message, exitCode, stage) {
  return Object.assign(new Error(message), { exitCode, stage });
}

function sha256(filePath, fsApi) {
  return createHash('sha256').update(fsApi.readFileSync(filePath)).digest('hex');
}

function parseJson(text, label) {
  try { return JSON.parse(text.replace(/^\uFEFF/u, '')); }
  catch { throw failure(`${label} is not valid JSON`, 64, 'preflight'); }
}

function verifySigningIdentity(paths, fsApi) {
  if (!fsApi.existsSync(paths.signingManifest) || !fsApi.existsSync(paths.signingKeystore)) {
    throw failure('Android signing identity is incomplete', 64, 'signing');
  }
  const manifest = parseJson(fsApi.readFileSync(paths.signingManifest, 'utf8'), 'signing identity');
  const expectedPath = fsApi.realpathSync.native(paths.signingKeystore);
  if (manifest.schemaVersion !== 1 || typeof manifest.keystorePath !== 'string'
      || manifest.keystorePath.toLowerCase() !== expectedPath.toLowerCase()
      || !/^[0-9a-f]{64}$/u.test(manifest.sha256)) {
    throw failure('Android signing identity contract is invalid', 64, 'signing');
  }
  if (sha256(paths.signingKeystore, fsApi) !== manifest.sha256) {
    throw failure('Android signing keystore hash changed', 64, 'signing');
  }
  return manifest;
}

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

export function formatWindowsDevFailure(summary) {
  const stage = String(summary.failureStage || 'entry').replace(/[^A-Za-z0-9_-]/gu, '').slice(0, 48);
  const message = String(summary.message || 'unknown failure').replace(/[\r\n]+/gu, ' ').slice(0, 500);
  return `[windows-dev-action] failure stage=${stage || 'entry'} message=${message}`;
}

export async function runWindowsDevBuild({
  action = 'build', deviceAction = runWindowsDevDeviceAction, execute = executeBounded,
  fsApi = fs, id = randomUUID, now = () => new Date(), paths = windowsDevPaths(),
  platform = process.platform, prepareHost = prepareWindowsAndroidDebugHost
} = {}) {
  const startedAt = now().toISOString();
  let context;
  let directChildPid = null;
  try {
    if (platform !== 'win32') throw failure('Windows DEV action requires Windows', 64, 'platform');
    if (!['appearance', 'build', 'deploy', 'live', 'verify'].includes(action)) throw failure('Unknown Windows DEV action', 64, 'request');
    context = evidenceContext(paths, now, id, fsApi);
    const requiredTools = [paths.systemNode,
      ...(['build', 'deploy'].includes(action) ? [paths.systemNpmCli] : []),
      ...(action === 'build' ? [] : [paths.adbPath])];
    for (const filePath of requiredTools) {
      if (!fsApi.existsSync(filePath)) throw failure(`Required tool is missing: ${filePath}`, 64, 'preflight');
    }
    const residualBefore = await snapshotProcesses(execute, paths);
    if (residualBefore.length > 0) throw failure('Repository-owned action process is already running', 73, 'residual');
    const signing = verifySigningIdentity(paths, fsApi);
    let output = '';
    if (['build', 'deploy'].includes(action)) {
      output += await prepareHost({ execute, fsApi, paths });
    }
    let actionResult = null;
    if (action === 'build') {
      const build = await execute('cmd.exe', ['/d', '/s', '/c', BUILD_COMMAND], {
        cwd: path.join(paths.repoRoot, 'android'),
        env: { ...process.env, ANDROID_HOME: paths.androidSdk, ANDROID_SDK_ROOT: paths.androidSdk,
          ANDROID_USER_HOME: paths.signingHome, JAVA_HOME: paths.javaHome },
        onSpawn: (child) => { directChildPid = child.pid; }, platform,
        timeoutCode: 'build_timeout', timeoutMs: BUILD_TIMEOUT_MS, windowsHide: true
      });
      if (build.code !== 0 || !build.output.includes('BUILD SUCCESSFUL')) {
        throw Object.assign(failure('Gradle did not reach BUILD SUCCESSFUL', 74, 'build'), { result: build });
      }
      output += build.output;
    } else {
      actionResult = await deviceAction({
        action, buildIdentity: context.runId, evidenceRoot: context.root, execute, paths
      });
      output += actionResult.output;
    }
    fsApi.writeFileSync(context.logPath, output, 'utf8');
    const summary = { action, completedAt: now().toISOString(), directChildPid,
      exitCode: 0, logPath: context.logPath, repoRoot: paths.repoRoot,
      resultStatus: 'success', runId: context.runId, schemaVersion: 1, signingSha256: signing.sha256,
      startedAt, ...(actionResult?.liveReload ? { liveReload: actionResult.liveReload } : {}) };
    writeJson(fsApi, context.summaryPath, summary);
    return { exitCode: 0, summary, summaryPath: context.summaryPath };
  } catch (error) {
    const exitCode = error.exitCode || 125;
    if (context && error.result?.output && !fsApi.existsSync(context.logPath)) {
      fsApi.writeFileSync(context.logPath, error.result.output, 'utf8');
    }
    const summary = { action, completedAt: now().toISOString(), directChildPid, exitCode,
      failureStage: error.stage || 'entry', message: error.message, resultStatus: 'failure',
      runId: context?.runId ?? null, schemaVersion: 1, startedAt,
      ...(error.liveReload ? { liveReload: error.liveReload } : {}) };
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
  stream(`[windows-dev-action] status: ${label} exit=${result.exitCode} evidence=${result.summaryPath ?? '-'}`);
  process.exitCode = result.exitCode;
}
