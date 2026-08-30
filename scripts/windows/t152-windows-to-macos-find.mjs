#!/usr/bin/env node
/* global process, URL */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { createT152DesktopDnsSdLibrary } from
  '../desktop/t152-desktop-dnssd-library.mjs';
import { runT152WindowsFormal } from './t152-windows-capsule-control.mjs';

const execute = promisify(execFile);
const DEFAULT_HOST = 'zephu@192.168.0.11';

function sshArgs(env) {
  const key = env.FOLIOLE_WINDOWS_DEV_SSH_KEY?.trim();
  if (!path.isAbsolute(key ?? '')) throw new Error('Explicit Windows SSH identity is required.');
  return ['-q', '-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes'];
}

async function releaseProvider(prepared, rootId, env, host) {
  const localPath = path.join(prepared.capsule.root, `provider-release-${rootId}.json`);
  fs.writeFileSync(localPath, `${JSON.stringify({ schemaVersion: 1,
    status: 'consumer_complete' }, null, 2)}\n`);
  const remotePath = path.win32.join(prepared.paths.capsuleRoot, 'state', rootId,
    'provider-release.json').replaceAll('\\', '/');
  await execute('scp', [...sshArgs(env), localPath, `${host}:${remotePath}`], { env });
}

async function productModules(productSource) {
  const root = pathToFileURL(`${productSource}${path.sep}`);
  return Promise.all([
    import(new URL('scripts/android/macos-sync-group-desktop-session.mjs', root)),
    import(new URL('scripts/sync-group/multi-device-sync-macos-channel.mjs', root))
  ]);
}

function startWindowsProvider(options) {
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  let matched = false;
  const work = runT152WindowsFormal({ ...options,
    action: 't152-desktop-dnssd-advertise-checkpoint', onOutput: (output) => {
      if (matched) return;
      const lines = output.match(/^\[t152-windows-formal-progress\] (.+)$/gmu) ?? [];
      const value = lines.at(-1)?.replace(/^\[t152-windows-formal-progress\] /u, '');
      if (!value) return;
      const progress = JSON.parse(value);
      if (progress.milestone === 'provider-ready') { matched = true; resolveReady(progress); }
    } }).catch((error) => { rejectReady(error); throw error; });
  return { ready, work };
}

export async function runT152WindowsToMacosCheckpoint({ env = process.env, evidenceRoot,
  host = env.FOLIOLE_WINDOWS_DEV_SSH || DEFAULT_HOST, prepared, productSource, rootId,
  taskBaseRoot }) {
  if (!path.isAbsolute(evidenceRoot ?? '') || !path.isAbsolute(taskBaseRoot ?? '')) {
    throw new Error('Explicit Mac roots are required.');
  }
  fs.mkdirSync(evidenceRoot, { recursive: false });
  const provider = startWindowsProvider({ env, host, prepared, rootId });
  let session;
  const locatorPath = path.join(evidenceRoot, 'locator.json');
  try {
    const expected = await provider.ready;
    const library = createT152DesktopDnsSdLibrary({ baseRoot: taskBaseRoot,
      evidenceRoot, rootId, sourceRoot: productSource });
    const [macos, channel] = await productModules(productSource);
    session = await macos.openMacosSyncGroupDesktopSession({ env: channel.macosAcceptanceEnv(),
      libraryHome: library.libraryRoot, operationId: rootId, repoRoot: productSource,
      runtimeLogPath: path.join(evidenceRoot, 'macos-runtime.log'),
      runtimeRoot: path.join(evidenceRoot, 'macos-runtime') });
    const overview = await session.waitForState({ command: 'load_sync_group_overview', condition: {
      groupId: expected.groupId, groupTag: expected.groupTag, kind: 'candidate-identity' },
    eventName: 'onSyncGroupDiscoveryChanged', timeoutMs: 2 * 60_000,
    triggerCommand: 'discover_sync_groups' });
    const matches = overview.join_candidates.filter((value) => value.group_id === expected.groupId
      && value.group_tag === expected.groupTag
      && value.provider_device_id === expected.deviceId);
    if (matches.length !== 1) throw new Error('Mac product candidate was not unique.');
    await session.invoke('stop_discover_sync_groups');
    await releaseProvider(prepared, rootId, env, host);
    const windows = await provider.work;
    const locator = { candidate: { groupId: matches[0].group_id,
      groupTag: matches[0].group_tag, providerDeviceId: matches[0].provider_device_id },
    completedAt: new Date().toISOString(), requestSent: false, resultStatus: 'success',
    rootId, schemaVersion: 2, windows: windows.receipt.result };
    fs.writeFileSync(locatorPath, `${JSON.stringify(locator, null, 2)}\n`);
    return { locator, locatorPath };
  } catch (error) {
    fs.writeFileSync(locatorPath, `${JSON.stringify({ error: error.message,
      resultStatus: 'failure', rootId, schemaVersion: 2 }, null, 2)}\n`);
    throw Object.assign(error, { locatorPath });
  } finally { await session?.close().catch(() => undefined); }
}
