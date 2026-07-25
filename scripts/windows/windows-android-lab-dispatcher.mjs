#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  androidLabPaths, LAB_EVIDENCE_FILES, parseAndroidLabCommand, publicLabStatus, readJson,
  safeLabEvidencePath, WINDOWS_ANDROID_LAB_TASK, writeJsonAtomic
} from './windows-android-lab-state.mjs';

function runChecked(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false, timeout: 30_000 });
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout;
}

function startRun(command, paths, runCommand) {
  const current = readJson(paths.status);
  if (current && ['pending', 'running'].includes(current.state)) {
    if (current.commitSha === command.commitSha) return publicLabStatus(current);
    throw Object.assign(new Error('another Android lab run is active'), { code: 'android_lab_busy' });
  }
  const runId = `${Date.now()}-${command.commitSha.slice(0, 12)}`;
  const request = { commitSha: command.commitSha, createdAt: new Date().toISOString(), runId, schemaVersion: 1 };
  writeJsonAtomic(paths.active, request);
  writeJsonAtomic(paths.status, { commitSha: request.commitSha, phase: 'queued', runId, schemaVersion: 1, state: 'pending' });
  runCommand('schtasks.exe', ['/Run', '/TN', WINDOWS_ANDROID_LAB_TASK]);
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
  const status = readJson(paths.status);
  if (!status || status.state !== 'running' || !Number.isSafeInteger(status.pid)) throw new Error('no Android lab run can be cancelled');
  runCommand('taskkill.exe', ['/PID', String(status.pid), '/T', '/F']);
  writeJsonAtomic(paths.status, {
    ...status, completedAt: new Date().toISOString(), errorCode: 'cancelled', phase: 'cancelled', resultStatus: 'failure', state: 'completed'
  });
  return publicLabStatus(readJson(paths.status));
}

export function dispatchWindowsAndroidLab({
  argv = process.argv.slice(2), env = process.env, paths = androidLabPaths(), runCommand = runChecked, stdout = process.stdout
} = {}) {
  const command = parseAndroidLabCommand(env.SSH_ORIGINAL_COMMAND?.trim() || argv.join(' '));
  if (command.action === 'run') return startRun(command, paths, runCommand);
  if (command.action === 'status') return publicLabStatus(readJson(paths.status));
  if (command.action === 'collect') return collect(command, paths, stdout);
  return cancel(paths, runCommand);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = dispatchWindowsAndroidLab();
    if (result) console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ error: error.code || 'android_lab_dispatch_failed', message: error.message, schemaVersion: 1 }));
    process.exitCode = 1;
  }
}
