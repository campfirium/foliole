import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  publicDeviceStatus, readJson, WINDOWS_ANDROID_LAB_TASK
} from './windows-android-lab-state.mjs';

function boundedOutput(value) {
  return String(value || '').slice(-4000);
}

function fileSha256(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function commandResult(runCommand, command, args, statusCode) {
  const result = runCommand(command, args);
  const exitCode = result?.code ?? 1;
  return {
    command, args, exitCode,
    output: boundedOutput(result?.output || result?.lines?.join('\n')),
    resultStatus: exitCode === 0 ? 'success' : 'failure',
    statusCode
  };
}

function parseTaskQuery(output) {
  const fields = {};
  for (const line of String(output || '').split(/\r?\n/u)) {
    const match = /^([^:]+):\s*(.*)$/u.exec(line.trim());
    if (match) fields[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return {
    lastResult: fields['last result'] || '',
    lastRunTime: fields['last run time'] || '',
    status: fields.status || '',
    taskToRun: fields['task to run'] || ''
  };
}

function installedFile(paths, name) {
  const filePath = path.join(paths.root, name);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error(`installed runtime file missing: ${name}`);
  return { name, sha256: fileSha256(filePath), size: stat.size };
}

function dependencyRefreshMode(paths) {
  const worker = fs.readFileSync(path.join(paths.root, 'windows-android-lab-worker.mjs'), 'utf8');
  const match = /ANDROID_WINDOWS_DEPENDENCY_REFRESH:\s*['"]([^'"]+)['"]/u.exec(worker);
  return match?.[1] || 'unknown';
}

function signingStatus(config, paths) {
  const expected = config.androidDebugKeystoreSha256 || '';
  if (!/^[0-9a-f]{64}$/u.test(expected)) {
    return { resultStatus: 'failure', statusCode: 'android_signing_missing' };
  }
  try {
    const actual = fileSha256(paths.signingKeystore);
    return {
      expectedSha256: expected, resultStatus: actual === expected ? 'success' : 'failure',
      statusCode: actual === expected ? 'ok' : 'android_signing_mismatch'
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { resultStatus: 'failure', statusCode: 'android_signing_missing' };
    throw error;
  }
}

function workerSyntaxStatus(config, paths, runCommand) {
  const nodePath = path.join(config.nodeDirectory || '', 'node.exe');
  return commandResult(runCommand, nodePath, ['--check', path.join(paths.root, 'windows-android-lab-worker.mjs')], 'worker_syntax');
}

function scheduledTaskStatus(runCommand) {
  const result = commandResult(runCommand, 'schtasks.exe', [
    '/Query', '/TN', WINDOWS_ANDROID_LAB_TASK, '/FO', 'LIST', '/V'
  ], 'scheduled_task_query');
  return { ...result, parsed: parseTaskQuery(result.output) };
}

export function runWindowsAndroidLabSelfcheck({
  paths, runCommand
}) {
  const config = readJson(paths.config) || {};
  const task = scheduledTaskStatus(runCommand);
  const workerSyntax = workerSyntaxStatus(config, paths, runCommand);
  const dependencyRefresh = dependencyRefreshMode(paths);
  const signing = signingStatus(config, paths);
  const device = publicDeviceStatus(readJson(paths.device));
  const collect = { resultStatus: fs.existsSync(paths.evidence) ? 'success' : 'failure' };
  const installedRuntime = [
    installedFile(paths, 'windows-android-lab-adb.mjs'),
    installedFile(paths, 'windows-android-lab-dispatcher.mjs'),
    installedFile(paths, 'windows-android-lab-worker.mjs'),
    installedFile(paths, 'windows-android-lab-operation.mjs'),
    installedFile(paths, 'windows-android-lab-state.mjs')
  ];
  const checks = [task, workerSyntax, signing, collect];
  const resultStatus = checks.every((check) => check.resultStatus === 'success') && dependencyRefresh === 'auto'
    ? 'success' : 'failure';
  return {
    collect, dependencyRefresh, device, installedRuntime, resultStatus, schemaVersion: 1,
    signing, task, workerSyntax
  };
}
