#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  androidLabPaths, LAB_EVIDENCE_FILES, parseAndroidLabCommand, publicLabStatus, readJson,
  publicDeviceStatus, safeLabEvidencePath, WINDOWS_ANDROID_LAB_SOURCE_REF, WINDOWS_ANDROID_LAB_TASK, writeJsonAtomic
} from './windows-android-lab-state.mjs';
import { reconnectAndroidDevice, validateAndroidLabConfig } from './windows-android-lab-device.mjs';

const WORKER_START_TIMEOUT_MS = 60_000;

function runProcess(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false, timeout: 30_000 });
  return {
    code: result.status ?? 1,
    lines: String(result.stdout || result.stderr || '').trim().split(/\r?\n/u).filter(Boolean),
    output: result.stdout || result.stderr || ''
  };
}

function closeStalePending(paths, now = Date.now()) {
  const status = readJson(paths.status);
  if (status?.state !== 'pending' || !status.createdAt) return status;
  if (now - Date.parse(status.createdAt) < WORKER_START_TIMEOUT_MS) return status;
  const completed = {
    ...status, completedAt: new Date(now).toISOString(), errorCode: 'worker_start_timeout',
    errorMessage: 'Windows Android Lab worker did not start', phase: 'completed', resultStatus: 'failure', state: 'completed'
  };
  writeJsonAtomic(paths.status, completed);
  const active = readJson(paths.active);
  if (active?.runId === status.runId) fs.rmSync(paths.active, { force: true });
  return completed;
}

function assertLabSourceCommit(config, commitSha, paths, runCommand) {
  if (!fs.existsSync(path.join(paths.repository, 'HEAD'))) {
    throw Object.assign(new Error('LAN Git source repository is missing'), { code: 'lab_source_missing' });
  }
  const result = runCommand(config.gitPath, [
    '--git-dir', paths.repository, 'merge-base', '--is-ancestor', commitSha, WINDOWS_ANDROID_LAB_SOURCE_REF
  ]);
  if (result?.code !== undefined && result.code !== 0) {
    throw Object.assign(new Error('commit is not reachable from the LAN Android Lab ref'), { code: 'commit_not_in_lab_ref' });
  }
}

function startRun(command, paths, runCommand, now) {
  const current = closeStalePending(paths, now);
  if (current && ['pending', 'running'].includes(current.state)) {
    if (current.commitSha === command.commitSha) return publicLabStatus(current);
    throw Object.assign(new Error('another Android lab run is active'), { code: 'android_lab_busy' });
  }
  const config = validateAndroidLabConfig(readJson(paths.config));
  assertLabSourceCommit(config, command.commitSha, paths, runCommand);
  const runId = `${now}-${command.commitSha.slice(0, 12)}`;
  const createdAt = new Date(now).toISOString();
  const request = { commitSha: command.commitSha, createdAt, runId, schemaVersion: 1 };
  writeJsonAtomic(paths.active, request);
  writeJsonAtomic(paths.status, { commitSha: request.commitSha, createdAt, phase: 'queued', runId, schemaVersion: 1, state: 'pending' });
  const started = runCommand('schtasks.exe', ['/Run', '/TN', WINDOWS_ANDROID_LAB_TASK]);
  if (started?.code !== undefined && started.code !== 0) {
    const failed = {
      ...request, completedAt: new Date(now).toISOString(), errorCode: 'scheduled_task_start_failed',
      errorMessage: String(started.output || 'scheduled task failed to start').trim(), phase: 'completed',
      resultStatus: 'failure', state: 'completed'
    };
    writeJsonAtomic(paths.status, failed);
    fs.rmSync(paths.active, { force: true });
    throw Object.assign(new Error(failed.errorMessage), { code: failed.errorCode });
  }
  return publicLabStatus(readJson(paths.status));
}

function collect(command, paths, stdout) {
  const status = readJson(paths.status);
  if (!status?.evidenceRoot) throw new Error('evidence is unavailable');
  if (command.operation === 'list') {
    return { files: [...LAB_EVIDENCE_FILES].filter((name) => fs.existsSync(path.join(status.evidenceRoot, name))).sort(), schemaVersion: 1 };
  }
  const filePath = safeLabEvidencePath(status.evidenceRoot, command.relativePath);
  if (!fs.statSync(filePath).isFile()) throw new Error('evidence path is not a file');
  stdout.write(fs.readFileSync(filePath));
  return null;
}

function cancel(paths, runCommand) {
  const status = closeStalePending(paths);
  if (!status || !['pending', 'running'].includes(status.state)) throw new Error('no Android lab run can be cancelled');
  if (status.state === 'running') {
    if (!Number.isSafeInteger(status.pid)) throw new Error('running Android lab has no worker pid');
    runCommand('taskkill.exe', ['/PID', String(status.pid), '/T', '/F']);
  }
  writeJsonAtomic(paths.status, {
    ...status, completedAt: new Date().toISOString(), errorCode: 'cancelled', phase: 'cancelled', resultStatus: 'failure', state: 'completed'
  });
  const active = readJson(paths.active);
  if (active?.runId === status.runId) fs.rmSync(paths.active, { force: true });
  return publicLabStatus(readJson(paths.status));
}

async function deviceAction(command, paths, runCommand) {
  if (command.operation === 'status') return publicDeviceStatus(readJson(paths.device));
  const status = closeStalePending(paths);
  if (status && ['pending', 'running'].includes(status.state)) {
    throw Object.assign(new Error('device reconnect is unavailable while a run is active'), { code: 'android_lab_busy' });
  }
  const config = validateAndroidLabConfig(readJson(paths.config));
  const device = await reconnectAndroidDevice(config, command.endpoint, paths, runCommand);
  return publicDeviceStatus(device);
}

async function readBoundedInput(input, byteLength) {
  if (Buffer.isBuffer(input)) return input;
  const chunks = [];
  let received = 0;
  for await (const chunk of input) {
    received += chunk.length;
    if (received > byteLength) throw new Error('signing payload exceeds declared byte length');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function installSigning(command, paths, input) {
  const status = closeStalePending(paths);
  if (status && ['pending', 'running'].includes(status.state)) {
    throw Object.assign(new Error('signing install is unavailable while a run is active'), { code: 'android_lab_busy' });
  }
  const config = readJson(paths.config);
  if (!config) throw new Error('Android lab config is missing');
  const payload = await readBoundedInput(input, command.byteLength);
  const sha256 = createHash('sha256').update(payload).digest('hex');
  if (payload.length !== command.byteLength || sha256 !== command.sha256) {
    throw Object.assign(new Error('signing payload length or SHA-256 does not match'), { code: 'android_signing_payload_mismatch' });
  }
  fs.mkdirSync(paths.signingHome, { recursive: true });
  const temporary = `${paths.signingKeystore}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, payload, { mode: 0o600 });
  fs.renameSync(temporary, paths.signingKeystore);
  writeJsonAtomic(paths.config, { ...config, androidDebugKeystoreSha256: sha256 });
  return { byteLength: payload.length, schemaVersion: 1, sha256, state: 'installed' };
}

export async function dispatchWindowsAndroidLab({
  argv = process.argv.slice(2), env = process.env, input = process.stdin, now = Date.now(), paths = androidLabPaths(),
  runCommand = runProcess, stdout = process.stdout
} = {}) {
  const command = parseAndroidLabCommand(env.SSH_ORIGINAL_COMMAND?.trim() || argv.join(' '));
  if (command.action === 'run') return startRun(command, paths, runCommand, now);
  if (command.action === 'status') return publicLabStatus(closeStalePending(paths, now));
  if (command.action === 'device') return deviceAction(command, paths, runCommand);
  if (command.action === 'signing') return installSigning(command, paths, input);
  if (command.action === 'collect') return collect(command, paths, stdout);
  return cancel(paths, runCommand);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await dispatchWindowsAndroidLab();
    if (result) console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ error: error.code || 'android_lab_dispatch_failed', message: error.message, schemaVersion: 1 }));
    process.exitCode = 1;
  }
}
