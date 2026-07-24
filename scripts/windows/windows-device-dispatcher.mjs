#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  devicePaths, isBusy, parseDeviceCommand, publicStatus, readJson, safeEvidencePath, taskIdentity,
  WINDOWS_DEVICE_TASK_NAME, writeJsonAtomic
} from './windows-device-state.mjs';

function currentCommand(argv, env) {
  return env.SSH_ORIGINAL_COMMAND?.trim() || argv.join(' ');
}

function runChecked(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false, timeout: 30_000 });
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout;
}

function evidenceFiles(root) {
  const allowed = new Set(['.html', '.json', '.log', '.png', '.txt', '.webm', '.zip']);
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && allowed.has(path.extname(entry.name).toLowerCase())) files.push(path.relative(root, fullPath).replaceAll(path.sep, '/'));
    }
  };
  visit(root);
  return files.sort();
}

function deploy(command, paths, runCommand) {
  const request = { ...command, createdAt: new Date().toISOString(), schemaVersion: 1 };
  delete request.action;
  const status = readJson(paths.status);
  if (isBusy(status, request)) throw Object.assign(new Error('another Windows device task is running'), { code: 'device_busy' });
  if (status?.identity === taskIdentity(request) && ['pending', 'running'].includes(status.state)) return publicStatus(status);
  writeJsonAtomic(paths.active, request);
  const pending = { identity: taskIdentity(request), schemaVersion: 1, state: 'pending' };
  writeJsonAtomic(paths.status, pending);
  runCommand('schtasks.exe', ['/Run', '/TN', WINDOWS_DEVICE_TASK_NAME]);
  return publicStatus(pending);
}

function collect(command, paths, stdout) {
  const status = readJson(paths.status);
  if (!status?.evidenceRoot) throw new Error('evidence is unavailable');
  if (command.operation === 'list') return { files: evidenceFiles(status.evidenceRoot), schemaVersion: 1 };
  const filePath = safeEvidencePath(status.evidenceRoot, command.relativePath);
  if (!fs.statSync(filePath).isFile()) throw new Error('evidence path is not a file');
  stdout.write(fs.readFileSync(filePath));
  return null;
}

function cancel(paths, runCommand) {
  const status = readJson(paths.status);
  if (!status || status.state !== 'running' || !Number.isSafeInteger(status.pid)) throw new Error('no running task can be cancelled');
  try {
    runCommand('taskkill.exe', ['/PID', String(status.pid), '/T', '/F']);
  } catch (error) {
    writeJsonAtomic(paths.status, {
      ...status,
      errorCode: 'cancel_incomplete',
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error),
      state: 'running'
    });
    throw error;
  }
  writeJsonAtomic(paths.status, { ...status, completedAt: new Date().toISOString(), errorCode: 'cancelled', resultStatus: 'failure', state: 'completed' });
  return publicStatus(readJson(paths.status));
}

export function dispatchWindowsDevice({ argv = process.argv.slice(2), env = process.env, paths = devicePaths(), runCommand = runChecked, stdout = process.stdout } = {}) {
  const command = parseDeviceCommand(currentCommand(argv, env));
  if (command.action === 'deploy') return deploy(command, paths, runCommand);
  if (command.action === 'status') return publicStatus(readJson(paths.status));
  if (command.action === 'collect') return collect(command, paths, stdout);
  if (command.action === 'cancel') return cancel(paths, runCommand);
  const status = readJson(paths.status);
  if (status && ['pending', 'running'].includes(status.state)) throw new Error('sleep is unavailable while a task is active');
  runCommand('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']);
  return { schemaVersion: 1, state: 'sleep_requested' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = dispatchWindowsDevice();
    if (result) console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ error: error.code || 'device_dispatch_failed', message: error.message, schemaVersion: 1 }));
    process.exitCode = 1;
  }
}
