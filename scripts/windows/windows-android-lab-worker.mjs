#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { executeBounded } from './windows-bounded-process.mjs';
import { resolveAndroidDevice, validateAndroidLabConfig } from './windows-android-lab-device.mjs';
import {
  finishWindowsAndroidLabReviewRun, runWindowsAndroidLabReviewPhase
} from './windows-android-lab-review-action.mjs';
import {
  androidLabPaths, readJson, WINDOWS_ANDROID_LAB_SOURCE_REF, writeJsonAtomic, writeSuccessfulDeployment
} from './windows-android-lab-state.mjs';

const PREVIEW_TIMEOUT_MS = 45 * 60_000;
const COMMAND_TIMEOUT_MS = 5 * 60_000;

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertAndroidSigning(config, paths) {
  if (!/^[0-9a-f]{64}$/u.test(config.androidDebugKeystoreSha256 || '')) {
    throw codedError('android_signing_missing', 'Android Lab signing identity is not installed');
  }
  let payload;
  try {
    payload = fs.readFileSync(paths.signingKeystore);
  } catch (error) {
    if (error.code === 'ENOENT') throw codedError('android_signing_missing', 'Android Lab debug keystore is missing');
    throw error;
  }
  const sha256 = createHash('sha256').update(payload).digest('hex');
  if (sha256 !== config.androidDebugKeystoreSha256) {
    throw codedError('android_signing_mismatch', 'Android Lab debug keystore does not match its installed identity');
  }
}

async function runChecked(executeCommand, command, args, options, code) {
  const result = await executeCommand(command, args, { timeoutCode: `${code}_timeout`, timeoutMs: COMMAND_TIMEOUT_MS, ...options });
  if (result.code !== 0) throw codedError(code, result.lines.at(-1) || `${command} exited ${result.code}`);
  return result;
}

function isolatedGitArgs(paths, args) {
  const hooksPath = path.join(paths.root, 'worker-empty-hooks');
  fs.mkdirSync(hooksPath, { recursive: true });
  return ['-c', `core.hooksPath=${hooksPath}`, ...args];
}

async function prepareCheckout(config, paths, executeCommand) {
  const gitOptions = { env: process.env };
  if (!fs.existsSync(path.join(paths.repository, 'HEAD'))) throw codedError('lab_source_missing', 'LAN Git source repository is missing');
  await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, 'cat-file', '-e', `${config.commitSha}^{commit}`
  ]), gitOptions, 'commit_missing');
  await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, 'merge-base', '--is-ancestor', config.commitSha, WINDOWS_ANDROID_LAB_SOURCE_REF
  ]), gitOptions, 'commit_not_in_lab_ref');
  fs.rmSync(paths.candidate, { force: true, recursive: true });
  await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, 'worktree', 'add', '--detach', paths.candidate, config.commitSha
  ]), gitOptions, 'checkout_failed');
  const status = await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '-C', paths.candidate, 'status', '--porcelain'
  ]), gitOptions, 'checkout_status_failed');
  if (status.output.trim()) throw codedError('checkout_dirty', 'controller checkout is not clean');
}

async function captureScreenshot(config, endpoint, paths, evidenceRoot, executeCommand) {
  if (!endpoint) return 'device unresolved';
  const script = path.join(paths.candidate, 'scripts', 'android', 'windows-screenshot.ps1');
  try {
    await runChecked(executeCommand, 'powershell.exe', [
      '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', script,
      '-OutputDir', evidenceRoot, '-TargetSerial', endpoint
    ], { env: process.env }, 'screenshot_failed');
    const screenshot = fs.readdirSync(evidenceRoot).filter((name) => /^android-.*\.png$/u.test(name)).sort().at(-1);
    if (screenshot) fs.renameSync(path.join(evidenceRoot, screenshot), path.join(evidenceRoot, 'screenshot.png'));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return null;
}

function previewEnvironment(config, endpoint, paths) {
  const toolPath = [config.nodeDirectory, path.win32.join(config.javaHome, 'bin'), path.win32.dirname(config.adbPath)]
    .filter(Boolean).join(';');
  return {
    ...process.env,
    ANDROID_USER_HOME: paths.signingHome,
    ANDROID_DATA_PROTECTION: '1',
    ANDROID_DATA_PROTECTION_BACKUP_DIR: paths.protection,
    ANDROID_DATA_PROTECTION_MANIFEST_DIR: paths.manifest,
    ANDROID_DATA_PROTECTION_RUNTIME_ROOT: paths.preview,
    ANDROID_ELECTRON_ABI_PREPARE: '1',
    ANDROID_GRADLE_STOP_AFTER_DEPLOY: '1',
    ANDROID_PREVIEW_AVD: '',
    ANDROID_PREVIEW_OPEN_STUDIO: '0',
    ANDROID_WINDOWS_DEPENDENCY_REFRESH: 'ci',
    ANDROID_WINDOWS_WORKDIR: paths.preview,
    FOLIOLE_ANDROID_SERIAL: endpoint,
    JAVA_HOME: config.javaHome,
    Path: `${toolPath};${process.env.Path || process.env.PATH || ''}`
  };
}

async function cleanupCheckout(config, paths, executeCommand) {
  if (!fs.existsSync(paths.candidate)) return;
  await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, 'worktree', 'remove', '--force', paths.candidate
  ]), { env: process.env }, 'checkout_cleanup_failed');
  await runChecked(executeCommand, config.gitPath, isolatedGitArgs(paths, [
    '--git-dir', paths.repository, 'worktree', 'prune'
  ]), { env: process.env }, 'checkout_cleanup_failed');
}

async function captureLogcat(config, endpoint, evidenceRoot, executeCommand) {
  if (!endpoint) return 'device unresolved';
  try {
    const result = await runChecked(executeCommand, config.adbPath, [
      '-s', endpoint, 'logcat', '-d', '-t', '2000'
    ], { env: process.env }, 'logcat_failed');
    const output = Buffer.from(result.output || '', 'utf8');
    const bounded = output.length > 1_000_000 ? output.subarray(output.length - 1_000_000) : output;
    const prefix = output.length > bounded.length ? '[truncated to last 1000000 bytes]\n' : '';
    fs.writeFileSync(path.join(evidenceRoot, 'logcat.txt'), Buffer.concat([Buffer.from(prefix), bounded]));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function writeRunEvidence(evidenceRoot, request, result, screenshotError, logcatError, device) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'runner.log'), `[bounded to last 500 lines]\n${result.lines.join('\n')}\n`, 'utf8');
  const summary = {
    commitSha: request.commitSha,
    deviceDiscovery: device?.discoverySource || 'failed',
    installDisposition: /cache:\s*HIT|install cache hit/iu.test(result.output) ? 'cache_hit' : 'installed',
    previewStatus: result.code === 0 ? 'opened' : 'failed',
    runId: request.runId,
    schemaVersion: 1,
    logcatStatus: logcatError ? 'failed' : 'captured',
    screenshotStatus: screenshotError ? 'failed' : 'captured',
    syncReadiness: /sync readiness check failed/iu.test(result.output) ? 'failed' : 'passed'
  };
  writeJsonAtomic(path.join(evidenceRoot, 'summary.json'), summary);
}

export async function runWindowsAndroidLabWorker({
  executeCommand = executeBounded, paths = androidLabPaths(), platform = process.platform,
  runReviewPhase = runWindowsAndroidLabReviewPhase
} = {}) {
  if (platform !== 'win32') throw new Error('Windows Android lab worker requires win32');
  const request = readJson(paths.active);
  const installedConfig = readJson(paths.config);
  if (!request || !installedConfig) throw new Error('Android lab request or config is missing');
  const config = { ...installedConfig, commitSha: request.commitSha };
  const evidenceRoot = path.join(paths.evidence, request.runId);
  const startedAt = new Date().toISOString();
  const running = { ...request, evidenceRoot, phase: 'device_resolve', pid: process.pid, startedAt, state: 'running' };
  writeJsonAtomic(paths.status, running);
  if (request.action === 'review') {
    return finishWindowsAndroidLabReviewRun({ executeCommand, paths, request, runReviewPhase, running });
  }
  let previewResult = { code: 1, lines: [], output: '' };
  let device = null;
  let primaryError = null;
  try {
    validateAndroidLabConfig(config);
    assertAndroidSigning(config, paths);
    device = await resolveAndroidDevice(config, paths, executeCommand);
    writeJsonAtomic(paths.status, { ...running, phase: 'checkout' });
    await prepareCheckout(config, paths, executeCommand);
    fs.mkdirSync(paths.protection, { recursive: true });
    fs.mkdirSync(paths.manifest, { recursive: true });
    writeJsonAtomic(paths.status, { ...running, phase: 'preview' });
    previewResult = await executeCommand(config.bashPath, [
      '-lc', 'cd "$1" && exec bash scripts/android/android-preview.sh', 'foliole-android-lab', paths.candidate
    ], { cwd: paths.candidate, env: previewEnvironment(config, device.endpoint, paths), timeoutCode: 'android_preview_timeout', timeoutMs: PREVIEW_TIMEOUT_MS });
    if (previewResult.code !== 0) primaryError = codedError('android_preview_failed', previewResult.lines.at(-1) || 'Android preview failed');
  } catch (error) {
    primaryError = error;
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const logcatError = await captureLogcat(config, device?.endpoint, evidenceRoot, executeCommand);
  const screenshotError = await captureScreenshot(config, device?.endpoint, paths, evidenceRoot, executeCommand);
  try {
    await cleanupCheckout(config, paths, executeCommand);
  } catch (error) {
    primaryError ||= error;
  }
  writeRunEvidence(evidenceRoot, request, previewResult, screenshotError, logcatError, device);
  const completedAt = new Date().toISOString();
  if (!primaryError) {
    try {
      writeSuccessfulDeployment(paths, request, device, completedAt);
    } catch (error) {
      primaryError = error;
    }
  }
  const completed = {
    ...running, completedAt, errorCode: primaryError?.code,
    errorMessage: primaryError?.message?.slice(0, 500), phase: 'completed', resultStatus: primaryError ? 'failure' : 'success', state: 'completed'
  };
  writeJsonAtomic(paths.status, completed);
  const active = readJson(paths.active);
  if (active?.runId === request.runId) fs.rmSync(paths.active, { force: true });
  if (primaryError) throw primaryError;
  return completed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runWindowsAndroidLabWorker().catch((error) => {
    console.error(`[windows-android-lab-worker] ${error.code || 'error'}: ${error.message}`);
    process.exitCode = 1;
  });
}
