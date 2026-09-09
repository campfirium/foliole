#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { currentAcceptanceCandidate } from '../sync-group/multi-device-sync-candidate.mjs';
import { normalizeCandidateSourceRef } from '../sync-group/multi-device-sync-source-ref.mjs';
import {
  assertT173RuntimeIdentity, T173_WINDOWS_ACTIONS, T173_WINDOWS_REPO_ROOT_POSIX
} from '../windows/t173-windows-candidate-contract.mjs';
import { WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS } from
  '../windows/windows-sync-group-provider-release-control.mjs';

const HOST = 'zephu@192.168.0.11';
const GIT_HOST = `${HOST}:foliole-dev.git`;
const REMOTE_ACTION = `${T173_WINDOWS_REPO_ROOT_POSIX}/scripts/windows/`
  + 't173-windows-candidate-action.ps1';
const RECEIPTS = { 'multi-device-sync-c': 'sync-group-recovery-receipt.json' };
const ACTIVE_ROUTE = '.tmp/artifacts/multi-device-sync/windows-c/t173-active-route.json';

export function parseT173WindowsCandidateControlArgs(argv) {
  const sourceIndex = argv.indexOf('--source-ref');
  const sourceRef = sourceIndex < 0 ? undefined : argv[sourceIndex + 1];
  const args = sourceIndex < 0 ? [...argv] : argv.toSpliced(sourceIndex, 2);
  const action = args[0];
  const allowed = new Set(['multi-device-sync-candidate', ...T173_WINDOWS_ACTIONS,
    ...Object.values(WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS)]);
  if (args.length !== 1 || !allowed.has(action)
      || normalizeCandidateSourceRef(sourceRef) !== 'refs/heads/sync') {
    throw new Error('T173 Windows candidate control arguments are invalid.');
  }
  return { action, sourceRef };
}

function sshOptions(key) {
  return ['-T', '-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes'];
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env,
      shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { const text = chunk.toString(); output += text;
      if (options.stream) process.stdout.write(text); });
    child.stderr.on('data', (chunk) => { const text = chunk.toString(); output += text;
      if (options.stream) process.stderr.write(text); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve(output)
      : reject(Object.assign(new Error(output.trim() || `${command} exited ${code}`), { output })));
  });
}

function remoteArgs(key, config, action) {
  return [...sshOptions(key), HOST, 'powershell.exe', '-NoProfile', '-NonInteractive',
    '-ExecutionPolicy', 'Bypass', '-File', REMOTE_ACTION, '-Action', action,
    '-Revision', config.revision, '-TreeDigest', config.treeDigest,
    '-RouteIdentity', config.routeIdentity];
}

export function parseT173WindowsCandidateManifest(output, config, action) {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = new RegExp(`^\\[t173-windows-candidate\\] action=${escaped} `
    + `identity=${config.routeIdentity} manifest=([^\\r\\n]+)$`, 'mu').exec(output);
  if (!match) throw new Error('T173 Windows candidate receipt was not reported.');
  const remote = match[1].replaceAll('\\', '/');
  const root = `${T173_WINDOWS_REPO_ROOT_POSIX}/.tmp/artifacts/t173-windows-candidate/`
    + `${config.routeIdentity}/`;
  if (!remote.startsWith(root) || !remote.endsWith('/receipt.json')) {
    throw new Error('T173 Windows candidate receipt escaped its task-owned root.');
  }
  return remote;
}

async function copy(key, remote, local, cwd) {
  fs.mkdirSync(path.dirname(local), { recursive: true });
  await run('scp', ['-q', ...sshOptions(key).slice(1), `${HOST}:${remote}`, local], { cwd });
}

async function prepare(config, key, repoRoot) {
  const gitKey = path.join(os.homedir(), '.ssh', 'agent', 'foliole-windows-android-lab-git');
  await run('git', ['push', '--no-verify', '--porcelain', GIT_HOST,
    'refs/heads/sync:refs/heads/sync'], { cwd: repoRoot, env: { ...process.env,
      GIT_SSH_COMMAND: `ssh -i '${gitKey}' -o BatchMode=yes -o IdentitiesOnly=yes `
        + '-o ConnectTimeout=15 -o StrictHostKeyChecking=yes' } });
  await run(process.execPath, ['scripts/acceptance/windows-sync-client-control.mjs', 'align',
    '--revision', config.revision], { cwd: repoRoot, stream: true });
  const output = await run('ssh', remoteArgs(key, config, 'prepare'), { cwd: repoRoot, stream: true });
  const remote = parseT173WindowsCandidateManifest(output, config, 'prepare');
  const local = path.join(repoRoot, '.tmp', 'artifacts', 'windows-candidate',
    config.routeIdentity, 'candidate-controller-receipt.json');
  await copy(key, remote, local, repoRoot);
  const receipt = JSON.parse(fs.readFileSync(local, 'utf8'));
  assertT173RuntimeIdentity(config.expected, receipt.runtimeIdentity);
  const projected = { remoteBranch: 'sync', resultStatus: 'success',
    revision: config.revision, schemaVersion: 1, sourceRef: 'refs/heads/sync',
    targetRef: 'refs/heads/sync', treeDigest: config.treeDigest };
  process.stdout.write(`[windows-dev-control] candidate-receipt=${JSON.stringify(projected)}\n`);
  return { evidenceRoot: path.dirname(local), manifestPath: local };
}

async function executeAction(config, key, repoRoot) {
  const release = Object.values(WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS).includes(config.action);
  const activePath = path.join(repoRoot, ACTIVE_ROUTE);
  if (!release) {
    fs.mkdirSync(path.dirname(activePath), { recursive: true });
    fs.writeFileSync(activePath, `${JSON.stringify({ action: config.action,
      revision: config.revision, routeIdentity: config.routeIdentity,
      treeDigest: config.treeDigest }, null, 2)}\n`, 'utf8');
  }
  let output;
  try {
    output = await run('ssh', remoteArgs(key, config, config.action), {
      cwd: repoRoot, stream: true
    });
  } finally {
    if (!release) fs.rmSync(activePath, { force: true });
  }
  if (release) return {};
  const remote = parseT173WindowsCandidateManifest(output, config, config.action);
  const localRoot = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync',
    'windows-c', config.routeIdentity);
  const wrapperPath = path.join(localRoot, 't173-candidate-runtime-receipt.json');
  await copy(key, remote, wrapperPath, repoRoot);
  const wrapper = JSON.parse(fs.readFileSync(wrapperPath, 'utf8'));
  if (wrapper.action !== config.action || wrapper.resultStatus !== 'success'
      || wrapper.routeIdentity !== config.routeIdentity) {
    throw new Error('T173 Windows wrapper receipt identity is invalid.');
  }
  assertT173RuntimeIdentity(config.expected, wrapper.runtimeIdentity);
  assertT173RuntimeIdentity(config.expected, wrapper.workerRuntimeIdentity);
  const receiptName = RECEIPTS[config.action];
  const remoteActionPath = wrapper.actionReceiptPath.replaceAll('\\', '/');
  if (!remoteActionPath.startsWith(
    `${T173_WINDOWS_REPO_ROOT_POSIX}/.tmp/artifacts/windows-dev-action/`
  ) || !remoteActionPath.endsWith(`/${receiptName}`)) {
    throw new Error('T173 Windows product receipt escaped its candidate root.');
  }
  const actionPath = path.join(localRoot, receiptName);
  await copy(key, remoteActionPath, actionPath, repoRoot);
  process.stdout.write(`[windows-dev-action] ${config.action} identity=${config.routeIdentity} `
    + `manifest=${wrapper.actionReceiptPath}\n`);
  return { evidenceRoot: localRoot, manifestPath: actionPath };
}

export async function runT173WindowsCandidateControl({
  argv = process.argv.slice(2), repoRoot = process.cwd()
} = {}) {
  const request = parseT173WindowsCandidateControlArgs(argv);
  const candidate = currentAcceptanceCandidate(repoRoot, 'formal', request.sourceRef);
  const releasing = Object.values(WINDOWS_SYNC_GROUP_PROVIDER_RELEASE_ACTIONS)
    .includes(request.action);
  const active = releasing
    ? JSON.parse(fs.readFileSync(path.join(repoRoot, ACTIVE_ROUTE), 'utf8')) : null;
  if (active && (active.revision !== candidate.revision || active.treeDigest !== candidate.treeDigest
      || active.action !== 'multi-device-sync-c')) {
    throw new Error('T173 Windows active route does not match the current candidate.');
  }
  const routeIdentity = active?.routeIdentity
    ?? `t173-sync-${candidate.revision.slice(0, 10)}-${randomUUID()}`;
  const expected = { ...candidate, sourceRoot: 'D:\\C\\foliole-sync' };
  const config = { ...candidate, action: request.action, expected, routeIdentity };
  const key = path.join(os.homedir(), '.ssh', 'agent', 'foliole-windows-android-lab');
  return request.action === 'multi-device-sync-candidate'
    ? prepare(config, key, repoRoot) : executeAction(config, key, repoRoot);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runT173WindowsCandidateControl().catch((error) => {
    process.stderr.write(`[t173-windows-candidate-control] ${error.message}\n`);
    process.exitCode = 1;
  });
}
