#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CAPTURE_ANNOTATION_EVIDENCE_FILES } from './windows-a5-capture-annotation-contract.mjs';
import {
  parseWindowsDevCaptureAnnotationEvidence, parseWindowsDevFailureEvidence,
  parseWindowsDevLiveEvidence
} from './windows-dev-control-evidence.mjs';
import { runWindowsSyncGroupControl } from './windows-sync-group-control-router.mjs';
import {
  collectWindowsCandidateControl, extractCandidateSourceRef, freezeWindowsCandidate, windowsCandidatePushArgs
} from './windows-dev-candidate-control.mjs';
import { stopWindowsDevCandidateRuntime } from './windows-dev-candidate-runtime-control.mjs';
import { windowsDevScpSpec, windowsDevSshSpec } from './windows-dev-remote-spec.mjs';
import {
  isWindowsSyncGroupProviderReleaseAction, WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS
} from './windows-sync-group-provider-release-control.mjs';
import { copyWindowsDeviceProfileEvidence } from './windows-device-profile-control.mjs';
import {
  copyWindowsSyncGroupJoinPrepareEvidence
} from './windows-sync-group-join-prepare-control.mjs';

export {
  parseWindowsDevCaptureAnnotationEvidence, parseWindowsDevFailureEvidence,
  parseWindowsDevLiveEvidence,
  parseWindowsDevSuccessEvidence
} from './windows-dev-control-evidence.mjs';
export { windowsDevScpSpec, windowsDevSshSpec } from './windows-dev-remote-spec.mjs';

export const WINDOWS_DEV_SOURCE_REF = 'refs/heads/dev';
export const WINDOWS_DEV_DEFAULT_SSH = 'zephu@192.168.0.11';
export const WINDOWS_DEV_ACTIONS = [
  'appearance', 'build', 'capture-annotation', 'deploy', 'desktop-preview', 'device-profile', 'internal-install', 'internal-open', 'live', 'secondary',
  'sync-group-join-prepare',
  'multi-device-sync-a-leave', 'multi-device-sync-a-rejoin', 'multi-device-sync-c',
  'multi-device-sync-candidate', 'multi-device-sync-from-zero', 'multi-device-sync-participation',
  ...Object.values(WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS),
  'verify'
];
const CAPTURE_ANNOTATION_FILES = [...CAPTURE_ANNOTATION_EVIDENCE_FILES, 'summary.json'];
const CAPTURE_ANNOTATION_FAILURE_FILES = ['action.log', 'summary.json'];

function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { onOutput, ...spawnOptions } = options;
    const child = spawn(command, args, { ...spawnOptions, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (chunk) => { const text = chunk.toString(); stdout += text; onOutput?.(text); });
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
  const parsedSource = extractCandidateSourceRef(argv);
  const args = parsedSource.args;
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
  if (parsedSource.explicit && args[0] !== 'multi-device-sync-candidate') {
    throw new Error('Windows DEV source ref is only accepted for candidate preparation');
  }
  return { action: args[0], host,
    ...(parsedSource.explicit ? { sourceRef: parsedSource.sourceRef } : {}) };
}

export function windowsDevPushSpec(host, env = process.env, home = os.homedir(), sourceRef) {
  const key = env.FOLIOLE_WINDOWS_DEV_GIT_SSH_KEY
    || path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab-git');
  if (/['\0\r\n]/u.test(key)) throw new Error('Windows DEV Git key path contains unsupported characters');
  return {
    args: windowsCandidatePushArgs(host, sourceRef),
    env: {
      ...env,
      GIT_SSH_COMMAND: `ssh -i '${key}' -o BatchMode=yes -o IdentitiesOnly=yes `
        + '-o ConnectTimeout=15 -o StrictHostKeyChecking=yes'
    }
  };
}


async function copyCaptureAnnotationFiles({ env, executeScp, fsApi, host, names, remoteRoot, repoRoot }) {
  const localRoot = path.join(repoRoot, '.tmp', 'artifacts', 'a5-capture-annotation', path.basename(remoteRoot));
  fsApi.mkdirSync(localRoot, { recursive: true });
  for (const name of names) {
    await executeScp(windowsDevScpSpec(host, `${remoteRoot}/${name}`, path.join(localRoot, name), env), { env });
  }
  return localRoot;
}

export async function runWindowsDevControl({
  argv = process.argv.slice(2), env = process.env,
  executeGit = (args, options) => execute('git', args, options),
  executeScp = (args, options) => execute('scp', args, options),
  executeSsh = (args, options) => execute('ssh', args, options), fsApi = fs,
  repoRoot = process.cwd(), stdout = process.stdout
} = {}) {
  const { action, host, sourceRef = WINDOWS_DEV_SOURCE_REF } = parseWindowsDevControlArgs(argv, env);
  if (isWindowsSyncGroupProviderReleaseAction(action)) {
    const output = await executeSsh(windowsDevSshSpec(host, action, env), { env });
    if (output) stdout.write(output);
    return { action, operation: 'provider-release', ref: WINDOWS_DEV_SOURCE_REF };
  }
  const syncGroup = runWindowsSyncGroupControl(action, {
    buildPushSpec: windowsDevPushSpec, buildScpSpec: windowsDevScpSpec,
    buildSshSpec: windowsDevSshSpec, env, executeGit, executeScp, executeSsh, fsApi,
    host, repoRoot, stdout
  });
  if (syncGroup) return syncGroup;
  const localCandidate = action === 'multi-device-sync-candidate'
    ? freezeWindowsCandidate(repoRoot, sourceRef) : null;
  const spec = windowsDevPushSpec(host, env, os.homedir(), sourceRef);
  await executeGit(spec.args, { env: spec.env });
  if (action === 'multi-device-sync-candidate') {
    await stopWindowsDevCandidateRuntime({ env, executeSsh, host, stdout });
  }
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
  if (action === 'multi-device-sync-candidate' && !remoteError) {
    Object.assign(result, await collectWindowsCandidateControl({ fsApi, localCandidate,
      output: remoteOutput, repoRoot, sourceRef, stdout, copyFile: (remote, local) => executeScp(
        windowsDevScpSpec(host, remote, local, env), { env }) }));
  }
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
  const deviceProfile = await copyWindowsDeviceProfileEvidence({ action, fsApi, remoteError,
    remoteOutput, repoRoot, copyFile: (remote, local) => executeScp(
      windowsDevScpSpec(host, remote, local, env), { env }
    ) });
  if (deviceProfile) Object.assign(result, deviceProfile);
  const joinPrepare = await copyWindowsSyncGroupJoinPrepareEvidence({ action, fsApi, remoteError,
    remoteOutput, repoRoot, copyFile: (remote, local) => executeScp(
      windowsDevScpSpec(host, remote, local, env), { env }
    ) });
  if (joinPrepare) Object.assign(result, joinPrepare);
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
