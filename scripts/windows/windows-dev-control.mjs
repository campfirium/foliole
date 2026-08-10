#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CAPTURE_ANNOTATION_EVIDENCE_FILES } from './windows-a5-capture-annotation-contract.mjs';
import {
  copyWindowsDevPairSyncRecoveryEvidence, WINDOWS_DEV_PAIR_SYNC_RECOVERY_FILES
} from './windows-dev-pair-sync-evidence.mjs';
import { toWindowsDevWireAction } from './windows-dev-action-contract.mjs';
import { runWindowsSyncGroupRecoveryControl } from './windows-sync-group-recovery-control.mjs';
import { runWindowsSyncGroupBaselineControl } from './windows-sync-group-baseline-control.mjs';

export const WINDOWS_DEV_SOURCE_REF = 'refs/heads/dev';
export const WINDOWS_DEV_DEFAULT_SSH = 'zephu@192.168.0.11';
export const WINDOWS_DEV_ACTIONS = [
  'appearance', 'build', 'capture-annotation', 'deploy', 'live', 'pair-sync-recover', 'secondary',
  'sync-group-baseline-reset', 'sync-group-recover', 'verify'
];
const WINDOWS_DEV_REMOTE_ACTION = 'C:/dev/foliole-android-lab-preview/scripts/windows/windows-dev-action.ps1';
const WINDOWS_DEV_EVIDENCE_PREFIX = 'C:/dev/foliole-android-lab-preview/.tmp/artifacts/windows-dev-action/';
const CAPTURE_ANNOTATION_FILES = [...CAPTURE_ANNOTATION_EVIDENCE_FILES, 'summary.json'];
const CAPTURE_ANNOTATION_FAILURE_FILES = ['action.log', 'summary.json'];

function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout);
      const error = new Error(stderr.trim() || `${command} exited ${code}`);
      error.output = `${stdout}${stderr}`;
      reject(error);
    });
  });
}

export function parseWindowsDevControlArgs(argv, env = process.env) {
  const args = [...argv];
  const hostIndex = args.indexOf('--host');
  const host = hostIndex >= 0
    ? args.splice(hostIndex, 2)[1]
    : env.FOLIOLE_WINDOWS_DEV_SSH || WINDOWS_DEV_DEFAULT_SSH;
  if (!host || !/^[A-Za-z0-9._\\-]+@[A-Za-z0-9.-]+$/u.test(host)) {
    throw new Error('Windows DEV SSH host must use user@host format');
  }
  if (args.length !== 1 || !WINDOWS_DEV_ACTIONS.includes(args[0])) {
    throw new Error(
      'Windows DEV control only accepts a registered fixed action'
    );
  }
  return { action: args[0], host };
}

export function windowsDevPushSpec(host, env = process.env, home = os.homedir()) {
  const key = env.FOLIOLE_WINDOWS_DEV_GIT_SSH_KEY
    || path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab-git');
  if (/['\0\r\n]/u.test(key)) throw new Error('Windows DEV Git key path contains unsupported characters');
  return {
    args: ['push', '--porcelain', `${host}:foliole-dev.git`, `dev:${WINDOWS_DEV_SOURCE_REF}`],
    env: {
      ...env,
      GIT_SSH_COMMAND: `ssh -i '${key}' -o BatchMode=yes -o IdentitiesOnly=yes `
        + '-o ConnectTimeout=15 -o StrictHostKeyChecking=yes'
    }
  };
}

export function windowsDevSshSpec(host, action, env = process.env, home = os.homedir()) {
  const key = env.FOLIOLE_WINDOWS_DEV_SSH_KEY
    || path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab');
  return ['-T', '-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', host,
    'powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', WINDOWS_DEV_REMOTE_ACTION, toWindowsDevWireAction(action)];
}

export function parseWindowsDevLiveEvidence(output) {
  const match = /^\[windows-dev-action\] live identity=([A-Za-z0-9.-]{1,96}) screenshot=([^\r\n]+)$/mu.exec(output);
  if (!match) throw new Error('Windows DEV live action did not report screenshot evidence');
  const normalized = match[2].replaceAll('\\', '/');
  const expected = `${WINDOWS_DEV_EVIDENCE_PREFIX}${match[1]}/a5-live.png`;
  if (normalized !== expected) throw new Error('Windows DEV live screenshot path escaped its fixed evidence root');
  return { buildIdentity: match[1], remotePath: normalized };
}

export function parseWindowsDevCaptureAnnotationEvidence(output) {
  const match = /^\[windows-dev-action\] capture-annotation identity=([A-Za-z0-9.-]{1,96}) manifest=([^\r\n]+)$/mu.exec(output);
  if (!match) throw new Error('Windows DEV capture-annotation action did not report fixed evidence');
  const remoteRoot = `${WINDOWS_DEV_EVIDENCE_PREFIX}${match[1]}`;
  if (match[2].replaceAll('\\', '/') !== `${remoteRoot}/capture-annotation-manifest.json`) {
    throw new Error('Windows DEV capture-annotation manifest escaped its fixed evidence root');
  }
  return { buildIdentity: match[1], remoteRoot };
}

export function parseWindowsDevPairSyncRecoveryEvidence(output) {
  const match = /^\[windows-dev-action\] pair-sync-recover identity=([A-Za-z0-9.-]{1,96}) manifest=([^\r\n]+)$/mu.exec(output);
  if (!match) throw new Error('Windows DEV pair-sync-recover action did not report fixed evidence');
  const remoteRoot = `${WINDOWS_DEV_EVIDENCE_PREFIX}${match[1]}`;
  if (match[2].replaceAll('\\', '/') !== `${remoteRoot}/pair-sync-recovery-manifest.json`) {
    throw new Error('Windows DEV pair-sync-recover manifest escaped its fixed evidence root');
  }
  return { buildIdentity: match[1], remoteRoot };
}

export function parseWindowsDevFailureEvidence(output) {
  const match = /^\[windows-dev-action\] status: FAILED exit=\d+ evidence=([^\r\n]+)$/mu.exec(output);
  if (!match) throw new Error('Windows DEV action did not report fixed failure evidence');
  const normalized = match[1].replaceAll('\\', '/');
  const suffix = '/summary.json';
  const buildIdentity = normalized.slice(WINDOWS_DEV_EVIDENCE_PREFIX.length, -suffix.length);
  if (!normalized.startsWith(WINDOWS_DEV_EVIDENCE_PREFIX) || !normalized.endsWith(suffix)
      || !/^[A-Za-z0-9.-]{1,96}$/u.test(buildIdentity)) {
    throw new Error('Windows DEV failure evidence escaped its fixed root');
  }
  return { buildIdentity, remoteRoot: normalized.slice(0, -suffix.length) };
}

async function copyCaptureAnnotationFiles({ env, executeScp, fsApi, host, names, remoteRoot, repoRoot }) {
  const localRoot = path.join(repoRoot, '.tmp', 'artifacts', 'a5-capture-annotation', path.basename(remoteRoot));
  fsApi.mkdirSync(localRoot, { recursive: true });
  for (const name of names) {
    await executeScp(windowsDevScpSpec(host, `${remoteRoot}/${name}`, path.join(localRoot, name), env), { env });
  }
  return localRoot;
}

export function windowsDevScpSpec(host, remotePath, localPath, env = process.env, home = os.homedir()) {
  const key = env.FOLIOLE_WINDOWS_DEV_SSH_KEY
    || path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab');
  return ['-q', '-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
    `${host}:${remotePath}`, localPath];
}

export async function runWindowsDevControl({
  argv = process.argv.slice(2), env = process.env,
  executeGit = (args, options) => execute('git', args, options),
  executeScp = (args, options) => execute('scp', args, options),
  executeSsh = (args, options) => execute('ssh', args, options), fsApi = fs,
  repoRoot = process.cwd(), stdout = process.stdout
} = {}) {
  const { action, host } = parseWindowsDevControlArgs(argv, env);
  if (action === 'sync-group-baseline-reset') return runWindowsSyncGroupBaselineControl({
    buildPushSpec: windowsDevPushSpec, buildScpSpec: windowsDevScpSpec,
    buildSshSpec: windowsDevSshSpec, env, executeGit, executeScp, executeSsh, host, repoRoot, stdout
  });
  if (action === 'sync-group-recover') return runWindowsSyncGroupRecoveryControl({
    buildPushSpec: windowsDevPushSpec, buildScpSpec: windowsDevScpSpec,
    buildSshSpec: windowsDevSshSpec, env, executeGit, executeScp, executeSsh, host, repoRoot, stdout
  });
  const spec = windowsDevPushSpec(host, env);
  await executeGit(spec.args, { env: spec.env });
  let remoteError = null;
  let remoteOutput = '';
  try {
    remoteOutput = await executeSsh(windowsDevSshSpec(host, action, env), { env });
  } catch (error) {
    remoteError = error;
    remoteOutput = error.output || error.message;
  }
  if (remoteOutput) stdout.write(remoteOutput);
  const result = { action, operation: 'complete', ref: WINDOWS_DEV_SOURCE_REF };
  if (action === 'capture-annotation') {
    let evidence;
    try {
      evidence = remoteError
        ? parseWindowsDevFailureEvidence(remoteOutput)
        : parseWindowsDevCaptureAnnotationEvidence(remoteOutput);
    }
    catch (error) {
      if (remoteError) throw remoteError;
      throw error;
    }
    const localRoot = await copyCaptureAnnotationFiles({ env, executeScp, fsApi, host,
      names: remoteError ? CAPTURE_ANNOTATION_FAILURE_FILES : CAPTURE_ANNOTATION_FILES,
      remoteRoot: evidence.remoteRoot, repoRoot });
    if (remoteError) stdout.write(`[windows-dev-control] failure evidence=${localRoot}\n`);
    result.evidenceRoot = localRoot;
    result.manifestPath = path.join(localRoot, CAPTURE_ANNOTATION_FILES[0]);
  }
  if (action === 'pair-sync-recover') {
    let evidence;
    try {
      evidence = remoteError
        ? parseWindowsDevFailureEvidence(remoteOutput)
        : parseWindowsDevPairSyncRecoveryEvidence(remoteOutput);
    } catch (error) {
      if (remoteError) throw remoteError;
      throw error;
    }
    const copied = await copyWindowsDevPairSyncRecoveryEvidence({
      copyFile: (name, localRoot) => executeScp(windowsDevScpSpec(
        host, `${evidence.remoteRoot}/${name}`, path.join(localRoot, name), env
      ), { env }),
      fsApi, remoteError, remoteRoot: evidence.remoteRoot, repoRoot
    });
    const localRoot = copied.localRoot;
    if (copied.warning) stdout.write(`[windows-dev-control] failure evidence copy incomplete: ${copied.warning}\n`);
    if (remoteError) stdout.write(`[windows-dev-control] failure evidence=${localRoot}\n`);
    result.evidenceRoot = localRoot;
    result.manifestPath = path.join(localRoot, WINDOWS_DEV_PAIR_SYNC_RECOVERY_FILES[0]);
  }
  if (['appearance', 'deploy', 'live', 'secondary'].includes(action)) {
    let evidence;
    try { evidence = parseWindowsDevLiveEvidence(remoteOutput); }
    catch (error) {
      if (remoteError) throw remoteError;
      throw error;
    }
    const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts', 'a5-live-reload');
    fsApi.mkdirSync(evidenceRoot, { recursive: true });
    const screenshotPath = path.join(evidenceRoot, `${evidence.buildIdentity}.png`);
    await executeScp(windowsDevScpSpec(host, evidence.remotePath, screenshotPath, env), { env });
    result.screenshotPath = screenshotPath;
  }
  if (remoteError) throw remoteError;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runWindowsDevControl().catch((error) => {
    console.error(`[windows-dev-control] ${error.message}`);
    process.exitCode = 1;
  });
}
