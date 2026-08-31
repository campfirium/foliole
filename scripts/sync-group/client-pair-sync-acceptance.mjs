#!/usr/bin/env node

/* global process */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';

import {
  waitForMacosDeviceRequest, openMacosSyncGroupDesktopSession
} from '../android/macos-sync-group-desktop-session.mjs';
import {
  createClientPairTopic, updateClientPairTopic
} from '../desktop/client-pair-sync-content-action.mjs';
import {
  signalWindowsClientPair, startWindowsClientPairParticipant
} from './client-pair-windows-participant.mjs';

const REPO_ROOT = '/Users/roamer/P/Foliole-sync';
const COMMAND_TIMEOUT_MS = 30_000;

async function withCommandTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out.`)), COMMAND_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function invokeMac(session, command, args) {
  return withCommandTimeout(session.invoke(command, args), `Mac command ${command}`);
}

function exactMatch(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} did not match the exact product snapshot.`);
  }
}

function sourceRevision() {
  const branch = execFileSync('git', ['branch', '--show-current'], {
    cwd: REPO_ROOT, encoding: 'utf8'
  }).trim();
  const dirty = execFileSync('git', ['status', '--short'], {
    cwd: REPO_ROOT, encoding: 'utf8'
  }).trim();
  if (branch !== 'sync' || dirty) throw new Error('Mac client-pair checkout must be clean sync.');
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function buildMacClient() {
  for (const script of ['build', 'electron:rebuild:native', 'electron:compile']) {
    execFileSync('npm', ['run', script], {
      cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: 'inherit'
    });
  }
}

async function observeExact(session, expected) {
  const snapshot = await session.waitForState({ command: 'load_workspace_list_snapshot',
    commandArgs: { includePdfOpenings: false }, condition: { kind: 'exact-node', ...expected },
    eventName: 'onWorkspaceSyncApplied', timeoutMs: 90_000 });
  const actual = snapshot.nodesById[expected.nodeId];
  exactMatch({ content: actual.content, nodeId: actual.nodeId, title: actual.title,
    updatedAt: actual.updatedAt }, expected, expected.nodeId);
}

async function joinMacToWindows(session, windows) {
  await invokeMac(session, 'enable_companion_sync');
  const identity = await windows.event('owner-ready');
  const overview = await session.waitForState({ command: 'load_sync_group_overview',
    condition: { ...identity, kind: 'candidate-identity' },
    eventName: 'onSyncGroupDiscoveryChanged', timeoutMs: 90_000,
    triggerCommand: 'discover_sync_groups' });
  const candidate = overview.join_candidates.find((item) =>
    item.group_id === identity.groupId && item.group_tag === identity.groupTag);
  await invokeMac(session, 'request_sync_group_join', { endpoint_url: candidate.endpoint_url });
  await signalWindowsClientPair(windows.signalRoot, 'join-requested');
  await windows.event('owner-accepted');
  await invokeMac(session, 'complete_sync_group_join');
  await signalWindowsClientPair(windows.signalRoot, 'join-complete');
  return identity;
}

async function joinWindowsToMac(session, windows) {
  await windows.event('join-requested');
  const request = await waitForMacosDeviceRequest(session, null, { timeoutMs: 90_000 });
  await session.accept(request.request_id);
  await signalWindowsClientPair(windows.signalRoot, 'owner-accepted');
  await windows.event('join-complete');
}

async function contentRoundTrip(session, windows, label) {
  const windowsCreated = await windows.event('windows-created');
  await observeExact(session, windowsCreated);
  await signalWindowsClientPair(windows.signalRoot, 'mac-observed-windows-create');
  const windowsUpdated = await windows.event('windows-updated');
  await observeExact(session, windowsUpdated);
  await signalWindowsClientPair(windows.signalRoot, 'mac-observed-windows-update');

  const boundedSession = { invoke: (command, args) => invokeMac(session, command, args) };
  const macCreated = await createClientPairTopic({ label: `${label}-mac`,
    session: boundedSession });
  await signalWindowsClientPair(windows.signalRoot, 'mac-created', macCreated);
  exactMatch(await windows.event('mac-create-observed'), macCreated, 'Windows create observation');
  const macUpdated = await updateClientPairTopic({ expected: macCreated,
    session: boundedSession });
  await signalWindowsClientPair(windows.signalRoot, 'mac-updated', macUpdated);
  exactMatch(await windows.event('mac-update-observed'), macUpdated, 'Windows update observation');
  return { macCreated, macUpdated, windowsCreated, windowsUpdated };
}

async function runScenario({ owner, revision, root, runId, skipBuild }) {
  const name = `${owner}-owner`;
  const localRoot = path.join(root, name);
  const session = await openMacosSyncGroupDesktopSession({
    env: { ...process.env, FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
      FOLIOLE_COMPANION_SYNC_PORT: '38642' },
    libraryHome: path.join(localRoot, 'library'), operationId: `${runId}-${name}`,
    repoRoot: REPO_ROOT, runtimeLogPath: path.join(localRoot, 'macos-runtime.log'),
    runtimeRoot: path.join(localRoot, 'runtime')
  });
  let windows;
  try {
    const macGroup = owner === 'mac'
      ? await withCommandTimeout(session.enable(), 'Mac Sync Group setup') : null;
    const groupIdentity = macGroup ? { groupId: macGroup.sync_group.group_id,
      groupTag: macGroup.sync_group.group_tag } : null;
    windows = startWindowsClientPairParticipant({ groupIdentity,
      revision, role: owner === 'mac' ? 'joiner' : 'owner', runId, scenario: name, skipBuild });
    const identity = owner === 'mac' ? groupIdentity : await joinMacToWindows(session, windows);
    if (owner === 'mac') await joinWindowsToMac(session, windows);
    const joined = await session.waitForState({ command: 'load_sync_group_overview',
      condition: { deviceCount: 2, groupId: identity.groupId, kind: 'group' },
      eventName: 'onSyncGroupDiscoveryChanged' });
    const deviceIds = joined.sync_group.devices.map((device) => device.device_id);
    if (new Set(deviceIds).size !== 2) throw new Error('Mac did not observe two device identities.');
    const content = await contentRoundTrip(session, windows, name);
    await signalWindowsClientPair(windows.signalRoot, 'release');
    const complete = await windows.event('complete');
    const terminal = await windows.finished;
    if (terminal.code !== 0) throw new Error(`Windows participant failed: ${terminal.stderr}`);
    return { complete, content, deviceIds, identity, owner, status: 'passed' };
  } finally {
    if (windows) await signalWindowsClientPair(windows.signalRoot, 'release').catch(() => undefined);
    await session.close().catch(() => undefined);
  }
}

const revision = sourceRevision();
buildMacClient();
const runId = `${new Date().toISOString().replace(/\D/gu, '').slice(0, 17)}-${randomUUID().slice(0, 8)}`;
const root = path.join(REPO_ROOT, '.tmp', 'artifacts', 'client-pair-sync', runId);
fs.mkdirSync(root, { recursive: true });
const scenarios = [];
scenarios.push(await runScenario({ owner: 'windows', revision, root, runId, skipBuild: false }));
scenarios.push(await runScenario({ owner: 'mac', revision, root, runId, skipBuild: true }));
const result = { completedAt: new Date().toISOString(), resultStatus: 'success', revision,
  runId, scenarios };
const locator = path.join(root, 'result.json');
fs.writeFileSync(locator, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ locator, ...result })}\n`);
