#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { executeBounded } from './windows-bounded-process.mjs';
import { androidLabPaths, assertExclusiveDevice, readJson, writeJsonAtomic } from './windows-android-lab-state.mjs';

const PREVIEW_TIMEOUT_MS = 45 * 60_000;
const COMMAND_TIMEOUT_MS = 5 * 60_000;

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

async function runChecked(executeCommand, command, args, options, code) {
  const result = await executeCommand(command, args, { timeoutCode: `${code}_timeout`, timeoutMs: COMMAND_TIMEOUT_MS, ...options });
  if (result.code !== 0) throw codedError(code, result.lines.at(-1) || `${command} exited ${result.code}`);
  return result;
}

function gitEnvironment(paths) {
  return {
    ...process.env,
    FOLIOLE_WINDOWS_ANDROID_LAB_GIT_TOKEN: paths.gitToken,
    GIT_ASKPASS: path.join(paths.root, 'git-askpass.cmd'),
    GIT_TERMINAL_PROMPT: '0'
  };
}

async function prepareCheckout(config, paths, executeCommand) {
  const gitOptions = { env: gitEnvironment(paths) };
  if (!fs.existsSync(path.join(paths.repository, 'HEAD'))) {
    await runChecked(executeCommand, config.gitPath, ['clone', '--mirror', config.repositoryUrl, paths.repository], gitOptions, 'git_clone_failed');
  }
  await runChecked(executeCommand, config.gitPath, [
    '--git-dir', paths.repository, 'fetch', '--prune', 'origin', '+refs/heads/dev:refs/heads/dev'
  ], gitOptions, 'git_fetch_failed');
  await runChecked(executeCommand, config.gitPath, [
    '--git-dir', paths.repository, 'cat-file', '-e', `${config.commitSha}^{commit}`
  ], gitOptions, 'commit_missing');
  await runChecked(executeCommand, config.gitPath, [
    '--git-dir', paths.repository, 'merge-base', '--is-ancestor', config.commitSha, 'refs/heads/dev'
  ], gitOptions, 'commit_not_on_dev');
  fs.rmSync(paths.candidate, { force: true, recursive: true });
  await runChecked(executeCommand, config.gitPath, [
    '--git-dir', paths.repository, 'worktree', 'add', '--detach', paths.candidate, config.commitSha
  ], gitOptions, 'checkout_failed');
  const status = await runChecked(executeCommand, config.gitPath, ['-C', paths.candidate, 'status', '--porcelain'], gitOptions, 'checkout_status_failed');
  if (status.output.trim()) throw codedError('checkout_dirty', 'controller checkout is not clean');
}

async function captureScreenshot(config, paths, evidenceRoot, executeCommand) {
  const script = path.join(paths.candidate, 'scripts', 'android', 'windows-screenshot.ps1');
  try {
    await runChecked(executeCommand, 'powershell.exe', [
      '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', script,
      '-OutputDir', evidenceRoot, '-TargetSerial', config.deviceSerial
    ], { env: process.env }, 'screenshot_failed');
    const screenshot = fs.readdirSync(evidenceRoot).filter((name) => /^android-.*\.png$/u.test(name)).sort().at(-1);
    if (screenshot) fs.renameSync(path.join(evidenceRoot, screenshot), path.join(evidenceRoot, 'screenshot.png'));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return null;
}

function previewEnvironment(config, paths) {
  return {
    ...process.env,
    ANDROID_DATA_PROTECTION: '1',
    ANDROID_DATA_PROTECTION_BACKUP_DIR: paths.protection,
    ANDROID_DATA_PROTECTION_MANIFEST_DIR: paths.manifest,
    ANDROID_GRADLE_STOP_AFTER_DEPLOY: '1',
    ANDROID_PREVIEW_AVD: '',
    ANDROID_PREVIEW_OPEN_STUDIO: '0',
    ANDROID_WINDOWS_DEPENDENCY_REFRESH: 'ci',
    ANDROID_WINDOWS_WORKDIR: paths.preview,
    FOLIOLE_ANDROID_SERIAL: config.deviceSerial
  };
}

async function cleanupCheckout(config, paths, executeCommand) {
  if (!fs.existsSync(paths.candidate)) return;
  await runChecked(executeCommand, config.gitPath, [
    '--git-dir', paths.repository, 'worktree', 'remove', '--force', paths.candidate
  ], { env: gitEnvironment(paths) }, 'checkout_cleanup_failed');
  await runChecked(executeCommand, config.gitPath, [
    '--git-dir', paths.repository, 'worktree', 'prune'
  ], { env: gitEnvironment(paths) }, 'checkout_cleanup_failed');
}

function writeRunEvidence(evidenceRoot, request, result, screenshotError) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'runner.log'), `[bounded to last 500 lines]\n${result.lines.join('\n')}\n`, 'utf8');
  const summary = {
    commitSha: request.commitSha,
    installDisposition: /cache:\s*HIT|install cache hit/iu.test(result.output) ? 'cache_hit' : 'installed',
    previewStatus: result.code === 0 ? 'opened' : 'failed',
    runId: request.runId,
    schemaVersion: 1,
    screenshotStatus: screenshotError ? 'failed' : 'captured',
    syncReadiness: /sync readiness check failed/iu.test(result.output) ? 'failed' : 'passed'
  };
  writeJsonAtomic(path.join(evidenceRoot, 'summary.json'), summary);
}

export async function runWindowsAndroidLabWorker({
  executeCommand = executeBounded, paths = androidLabPaths(), platform = process.platform
} = {}) {
  if (platform !== 'win32') throw new Error('Windows Android lab worker requires win32');
  const request = readJson(paths.active);
  const installedConfig = readJson(paths.config);
  if (!request || !installedConfig) throw new Error('Android lab request or config is missing');
  const config = { ...installedConfig, commitSha: request.commitSha };
  const evidenceRoot = path.join(paths.evidence, request.runId);
  const startedAt = new Date().toISOString();
  const running = { ...request, evidenceRoot, phase: 'device_preflight', pid: process.pid, startedAt, state: 'running' };
  writeJsonAtomic(paths.status, running);
  let previewResult = { code: 1, lines: [], output: '' };
  let primaryError = null;
  try {
    const devices = await runChecked(executeCommand, config.adbPath, ['devices'], { env: process.env }, 'adb_devices_failed');
    assertExclusiveDevice(devices.output, config.deviceSerial);
    writeJsonAtomic(paths.status, { ...running, phase: 'checkout' });
    await prepareCheckout(config, paths, executeCommand);
    fs.mkdirSync(paths.protection, { recursive: true });
    fs.mkdirSync(paths.manifest, { recursive: true });
    writeJsonAtomic(paths.status, { ...running, phase: 'preview' });
    previewResult = await executeCommand(config.bashPath, [
      '-lc', 'cd "$1" && exec bash scripts/android/android-preview.sh', 'foliole-android-lab', paths.candidate
    ], { cwd: paths.candidate, env: previewEnvironment(config, paths), timeoutCode: 'android_preview_timeout', timeoutMs: PREVIEW_TIMEOUT_MS });
    if (previewResult.code !== 0) primaryError = codedError('android_preview_failed', previewResult.lines.at(-1) || 'Android preview failed');
  } catch (error) {
    primaryError = error;
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const screenshotError = await captureScreenshot(config, paths, evidenceRoot, executeCommand);
  try {
    await cleanupCheckout(config, paths, executeCommand);
  } catch (error) {
    primaryError ||= error;
  }
  writeRunEvidence(evidenceRoot, request, previewResult, screenshotError);
  const completed = {
    ...running, completedAt: new Date().toISOString(), errorCode: primaryError?.code,
    errorMessage: primaryError?.message?.slice(0, 500), phase: 'completed', resultStatus: primaryError ? 'failure' : 'success', state: 'completed'
  };
  writeJsonAtomic(paths.status, completed);
  if (primaryError) throw primaryError;
  return completed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runWindowsAndroidLabWorker().catch((error) => {
    console.error(`[windows-android-lab-worker] ${error.code || 'error'}: ${error.message}`);
    process.exitCode = 1;
  });
}
