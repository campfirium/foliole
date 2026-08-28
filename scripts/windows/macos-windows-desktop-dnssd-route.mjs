#!/usr/bin/env node
/* global console, process, setTimeout */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { openMacosSyncGroupDesktopSession } from '../android/macos-sync-group-desktop-session.mjs';
import {
  desktopDnsSdRouteFixtureFact, reciprocalDesktopDnsSdRouteIdentity
} from '../desktop/desktop-dnssd-route-identity.mjs';
import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';
import { createActionExecutor } from '../sync-group/multi-device-sync-action-executor.mjs';
import { startWindowsSyncGroupProvider } from '../sync-group/multi-device-sync-windows-provider.mjs';

const execute = promisify(execFile);
const PRODUCT_REVISION = 'a89403c678efc4614b3b7ccbc1c78e12f742a54b';
const WINDOWS_ROUTE_FIXTURE_REVISION = 'b1daae23aa755088a9bc6cf4d9a5a9ec22b1910a';

async function acceptedTip(repoRoot) {
  const [{ stdout: head }, { stdout: remote }, { stdout: status }] = await Promise.all([
    execute('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }),
    execute('git', ['rev-parse', 'origin/dev'], { cwd: repoRoot }),
    execute('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repoRoot })
  ]);
  if (head.trim() !== remote.trim() || status.trim()) {
    throw new Error('Desktop DNS-SD acceptance requires clean HEAD == origin/dev.');
  }
  return head.trim();
}

function routeIdentity(overview) {
  const group = overview.sync_group;
  const localDeviceId = group?.local_device_identity_key;
  const peers = group?.devices?.filter(({ state, device_identity_key: deviceId }) =>
    state === 'active' && deviceId !== localDeviceId) ?? [];
  if (!overview.sync_enabled || overview.sync_paused !== false
      || !group?.group_id || !localDeviceId || peers.length !== 1
      || group.devices.filter(({ state }) => state === 'active').length !== 2) {
    throw new Error('Mac route acceptance requires one enabled, unpaused two-Device Sync Group.');
  }
  return { groupId: group.group_id, localDeviceId,
    peerDeviceId: peers[0].device_identity_key };
}

async function waitForMacRoute(session, identity, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let peerIds = [];
  while (Date.now() < deadline) {
    peerIds = await session.loadRoutePeerIds(identity.groupId);
    if (peerIds.includes(identity.peerDeviceId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Mac OS DNS-SD route was not rebuilt: ${peerIds.join(',')}`);
}

function assertWindowsReceipt(receipt, identity) {
  if (receipt.resultStatus !== 'success' || receipt.routePresent !== true
      || receipt.groupId !== identity.groupId
      || receipt.localDeviceId !== identity.peerDeviceId
      || receipt.peerDeviceId !== identity.localDeviceId) {
    throw new Error('Windows OS DNS-SD route receipt does not match the Mac Device pair.');
  }
}

async function runPhase({ evidenceRoot, label, libraryHome, repoRoot, runtimeRoot }) {
  const phaseRoot = path.join(evidenceRoot, label);
  fs.mkdirSync(phaseRoot, { recursive: true });
  const session = await openMacosSyncGroupDesktopSession({ env: macosAcceptanceEnv(),
    libraryHome, operationId: `${path.basename(evidenceRoot)}-${label}`, repoRoot,
    runtimeLogPath: path.join(phaseRoot, 'macos-runtime.log'),
    runtimeRoot: path.join(runtimeRoot, label) });
  const executor = createActionExecutor({ logPath: path.join(phaseRoot, 'windows-action.log'),
    progressPath: path.join(phaseRoot, 'windows-progress.jsonl') });
  const provider = startWindowsSyncGroupProvider({
    action: 'desktop-dnssd-route-provider', execute: executor, repoRoot
  });
  let settled = false;
  try {
    const identity = routeIdentity(await session.load());
    const windowsFixture = await provider.waitForProgress('fixture-ready');
    const expectedWindowsFixture = desktopDnsSdRouteFixtureFact(
      reciprocalDesktopDnsSdRouteIdentity(identity)
    );
    if (windowsFixture !== expectedWindowsFixture) {
      throw new Error('Windows route fixture is not the reciprocal Mac Device pair.');
    }
    await provider.waitForProgress('route-ready');
    await waitForMacRoute(session, identity);
    await provider.release('consumer_complete');
    const windows = await provider.finish();
    settled = true;
    assertWindowsReceipt(windows.receipt, identity);
    return { groupId: identity.groupId, label, macos: {
      localDeviceId: identity.localDeviceId, peerDeviceId: identity.peerDeviceId,
      processId: session.processId, routePresent: true
    }, windows: { evidenceRef: windows.evidenceRef,
      localDeviceId: windows.receipt.localDeviceId,
      peerDeviceId: windows.receipt.peerDeviceId,
      processId: windows.receipt.processId, routePresent: true } };
  } finally {
    await session.close().catch(() => undefined);
    if (!settled) await provider.cancelAndSettle();
  }
}

async function runAttempt({ acceptedTip: revision, attemptId, libraryHome, repoRoot, root }) {
  const evidenceRoot = path.join(root, 'attempts', attemptId);
  const runtimeRoot = path.join(evidenceRoot, 'macos-runtime');
  const initial = await runPhase({ evidenceRoot, label: 'initial', libraryHome, repoRoot, runtimeRoot });
  const restarted = await runPhase({ evidenceRoot, label: 'restarted', libraryHome, repoRoot, runtimeRoot });
  if (initial.groupId !== restarted.groupId
      || initial.macos.processId === restarted.macos.processId
      || initial.windows.processId === restarted.windows.processId) {
    throw new Error('Desktop restart did not rebuild the same Device route in fresh processes.');
  }
  const receipt = { acceptedTip: revision, attemptId, completedAt: new Date().toISOString(),
    initial, productRevision: PRODUCT_REVISION, restarted, resultStatus: 'success', schemaVersion: 1 };
  const receiptPath = path.join(evidenceRoot, 'receipt.json');
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { attemptId, receiptPath, resultStatus: 'success' };
}

export async function runMacosWindowsDesktopDnsSdRoute({ repoRoot = process.cwd() } = {}) {
  const revision = await acceptedTip(repoRoot);
  const libraryHome = process.env.FOLIOLE_T152_DISCOVERY_LIBRARY_ROOT?.trim()
    || path.join(repoRoot, '.tmp/artifacts/t152-9-matrix', WINDOWS_ROUTE_FIXTURE_REVISION,
      '01-macos-windows', 'attempt-1', 'macos-library');
  if (!fs.existsSync(path.join(libraryHome, 'Data', 'foliole.db'))) {
    throw new Error('Task-owned T152 desktop discovery library is missing.');
  }
  const root = path.join(repoRoot, '.tmp/artifacts/t152-11-desktop-dnssd', revision);
  fs.mkdirSync(path.join(root, 'attempts'), { recursive: true });
  const attempts = [];
  for (let index = 0; index < 2; index += 1) {
    const attemptId = `${new Date().toISOString().replace(/[-:.TZ]/gu, '')}-${randomUUID().slice(0, 8)}`;
    attempts.push(await runAttempt({ acceptedTip: revision, attemptId, libraryHome, repoRoot, root }));
  }
  const locator = { acceptedTip: revision, attempts, completedAt: new Date().toISOString(),
    productRevision: PRODUCT_REVISION, resultStatus: 'success', schemaVersion: 1 };
  const locatorPath = path.join(root, 'locator.json');
  fs.writeFileSync(locatorPath, `${JSON.stringify(locator, null, 2)}\n`, 'utf8');
  console.log(`[desktop-dnssd-route] status=success locator=${locatorPath}`);
  return { locator, locatorPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runMacosWindowsDesktopDnsSdRoute().catch((error) => {
    console.error(`[desktop-dnssd-route] status=failed message=${error.message}`);
    process.exitCode = 1;
  });
}
