#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { collectLabEvidence } from './windows-android-lab-evidence.mjs';
import {
  androidLabPaths, parseAndroidLabCommand, publicLabStatus, readJson,
  publicDeviceStatus, WINDOWS_ANDROID_LAB_SOURCE_REF, WINDOWS_ANDROID_LAB_TASK, writeJsonAtomic
} from './windows-android-lab-state.mjs';
import { validateAndroidLabConfig } from './windows-android-lab-device.mjs';
import { parseAndroidLabEnvelope } from './windows-android-lab-request.mjs';
import { runWindowsAndroidLabSelfcheck } from './windows-android-lab-selfcheck.mjs';

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

function writeActiveExclusive(paths, request) {
  fs.mkdirSync(path.dirname(paths.active), { recursive: true });
  let handle;
  try {
    handle = fs.openSync(paths.active, 'wx', 0o600);
    fs.writeFileSync(handle, `${JSON.stringify(request, null, 2)}\n`, 'utf8');
  } catch (error) {
    if (error.code === 'EEXIST') throw Object.assign(new Error('another Android lab run claimed the slot'), { code: 'android_lab_busy' });
    throw error;
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}

function queueRun(request, paths, runCommand, now) {
  const current = closeStalePending(paths, now);
  if (current && ['pending', 'running'].includes(current.state)) {
    if (current.requestId && current.requestId === request.requestId) {
      if (current.requestSha256 !== request.requestSha256) {
        throw Object.assign(new Error('request id was reused with different content'), { code: 'request_id_collision' });
      }
      return publicLabStatus(current);
    }
    if (!request.requestId && current.commitSha === request.commitSha && current.reviewPhase === request.reviewPhase) {
      return publicLabStatus(current);
    }
    throw Object.assign(new Error('another Android lab run is active'), { code: 'android_lab_busy' });
  }
  const config = validateAndroidLabConfig(readJson(paths.config));
  assertLabSourceCommit(config, request.commitSha, paths, runCommand);
  const suffix = request.reviewPhase ?? (request.action === 'reviewScenario' ? 'scenario' : '');
  const runId = `${now}-${request.commitSha.slice(0, 12)}${suffix ? `-${suffix}` : ''}`;
  const createdAt = new Date(now).toISOString();
  const queued = { ...request, createdAt, runId };
  writeActiveExclusive(paths, queued);
  writeJsonAtomic(paths.status, {
    commitSha: queued.commitSha, createdAt, mode: queued.mode, phase: 'queued', requestId: queued.requestId,
    requestSha256: queued.requestSha256,
    ...(queued.reviewPhase ? { reviewPhase: queued.reviewPhase } : {}), runId, schemaVersion: 1,
    state: 'pending', target: queued.target
  });
  const started = runCommand('schtasks.exe', ['/Run', '/TN', WINDOWS_ANDROID_LAB_TASK]);
  if (started?.code !== undefined && started.code !== 0) {
    const failed = {
      ...queued, completedAt: new Date(now).toISOString(), errorCode: 'scheduled_task_start_failed',
      errorMessage: String(started.output || 'scheduled task failed to start').trim(), phase: 'completed',
      resultStatus: 'failure', state: 'completed'
    };
    writeJsonAtomic(paths.status, failed);
    fs.rmSync(paths.active, { force: true });
    throw Object.assign(new Error(failed.errorMessage), { code: failed.errorCode });
  }
  return publicLabStatus(readJson(paths.status));
}

function startRun(command, paths, runCommand, now) {
  return queueRun({
    action: command.action, commitSha: command.commitSha,
    ...(command.reviewPhase ? { reviewPhase: command.reviewPhase } : {}), schemaVersion: 1
  }, paths, runCommand, now);
}

function collect(command, paths, stdout) {
  return collectLabEvidence(command, paths, readJson(paths.status), stdout);
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

function deviceAction(command, paths) {
  if (command.operation === 'status') return publicDeviceStatus(readJson(paths.device));
  throw Object.assign(new Error('device reconnect must be submitted in a commit-bound request envelope'), {
    code: 'device_reconnect_requires_request'
  });
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
  if (['review', 'reviewScenario', 'run'].includes(command.action)) return startRun(command, paths, runCommand, now);
  if (command.action === 'request') {
    const payload = await readBoundedInput(input, command.byteLength);
    const parsed = parseAndroidLabEnvelope(payload, command.byteLength, command.sha256);
    return queueRun({ ...parsed.envelope, action: 'request', requestSha256: parsed.sha256 }, paths, runCommand, now);
  }
  if (command.action === 'status') return publicLabStatus(closeStalePending(paths, now));
  if (command.action === 'selfcheck') return runWindowsAndroidLabSelfcheck({ paths, runCommand });
  if (command.action === 'device') return deviceAction(command, paths);
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
