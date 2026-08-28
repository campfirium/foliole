#!/usr/bin/env node
/* global AbortSignal, clearTimeout, console, fetch, process, setTimeout */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { Bonjour } from 'bonjour-service';

import {
  openMacosSyncGroupDesktopSession, waitForMacosDeviceRequest
} from '../android/macos-sync-group-desktop-session.mjs';
import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import {
  readSyncGroupControllerState,
  waitForSyncGroupAutomaticRun
} from '../desktop/sync-group-controller-read.mjs';
import { createActionExecutor } from '../sync-group/multi-device-sync-action-executor.mjs';
import { startWindowsSyncGroupProvider } from '../sync-group/multi-device-sync-windows-provider.mjs';
import { runMacosJoinsWindowsSyncGroup } from './macos-joins-windows-sync-group.mjs';

const execute = promisify(execFile);

function serviceIpv4Candidates(service) {
  const advertised = typeof service.txt?.ipv4_addresses === 'string'
    ? service.txt.ipv4_addresses.split(',') : [];
  return [...new Set([service.referer?.address, ...(service.addresses ?? []), ...advertised]
    .filter((value) => /^\d+\.\d+\.\d+\.\d+$/u.test(value ?? '')))];
}

export async function waitForMacosProvider(groupId, port, {
  createBonjour = () => new Bonjour(), fetchProvider = fetch, timeoutMs = 30_000
} = {}) {
  const bonjour = createBonjour();
  let browser;
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(
        'Mac acceptance provider was not published before Windows discovery.'
      )), timeoutMs);
      const collect = async (service) => {
        if (service.port !== Number(port) || service.txt?.group_id !== groupId) return;
        for (const host of serviceIpv4Candidates(service)) {
          try {
            const endpointUrl = `http://${host}:${service.port}`;
            const response = await fetchProvider(`${endpointUrl}/companion/discovery`, {
              signal: AbortSignal.timeout(2_000)
            });
            const payload = response.ok ? await response.json() : null;
            if (payload?.group_id !== groupId) continue;
            clearTimeout(timer);
            resolve({ endpointUrl, serviceName: service.name });
            return;
          } catch { /* Try the next address carried by this advertisement. */ }
        }
      };
      browser = bonjour.find({ protocol: 'tcp', type: 'foliole-sync' }, collect);
    });
  } finally {
    browser?.stop();
    bonjour.destroy();
  }
}

async function acceptedRevision(repoRoot) {
  const { stdout } = await execute('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
  return stdout.trim();
}

async function waitForOriginCount(session, origin, count, timeoutMs = 2 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await readSyncGroupControllerState(() => session.invoke(
      'load_workspace_list_snapshot', { includePdfOpenings: false }
    ));
    const matches = Object.values(snapshot?.nodesById ?? {}).filter(({ title }) =>
      String(title).startsWith(`Multi-device sync ${origin} fact`));
    if (matches.length >= count) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Mac did not receive ${count} ${origin} business facts.`);
}

export async function runMacosWindowsSinglePrincipalSyncGroup({
  creator = 'macos', repoRoot = process.cwd()
} = {}) {
  const acceptedTip = await acceptedRevision(repoRoot);
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/t152-7-windows', acceptedTip,
    creator === 'windows' ? 'windows-creates' : 'macos-creates');
  const sharedRoot = process.env.FOLIOLE_T152_ACCEPTANCE_ROOT?.trim() || evidenceRoot;
  if (creator === 'windows') {
    return runMacosJoinsWindowsSyncGroup({ acceptedTip, evidenceRoot, repoRoot, sharedRoot });
  }
  if (creator !== 'macos') throw new Error('Desktop creator must be macos or windows.');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  let session = await openMacosSyncGroupDesktopSession({ env: macosAcceptanceEnv(),
    libraryHome: path.join(sharedRoot, 'macos-library'), repoRoot,
    runtimeRoot: path.join(sharedRoot, 'macos-runtime') });
  let windowsProvider;
  let windowsSettled = false;
  try {
    const macosFact = await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(evidenceRoot, 'macos-fact'), session });
    const initial = await session.enable();
    const provider = await waitForMacosProvider(
      initial.sync_group.group_id, initial.server_status.port
    );
    const runWindowsAction = createActionExecutor({
      logPath: path.join(evidenceRoot, 'windows-action.log'),
      progressPath: path.join(evidenceRoot, 'windows-progress.jsonl')
    });
    windowsProvider = startWindowsSyncGroupProvider({
      action: 'single-principal-sync-group', execute: runWindowsAction, repoRoot
    });
    await windowsProvider.waitForProgress('requested');
    const request = await waitForMacosDeviceRequest(session, null, { timeoutMs: 15 * 60_000 });
    const accepted = await session.accept(request.request_id);
    await waitForOriginCount(session, 'C', 2);
    await session.invoke('sync_companion_now');
    await session.invoke('sync_companion_now');
    const macosAutomaticFact = await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(evidenceRoot, 'macos-automatic-fact'), session });
    await windowsProvider.waitForProgress('restarted');
    const automaticSnapshot = await session.invoke('load_workspace_list_snapshot', {
      includePdfOpenings: false
    });
    const factIds = Object.values(automaticSnapshot.nodesById).filter(({ title }) =>
      /^Multi-device sync [AC] fact/u.test(String(title))).map(({ id }) => id).sort();
    const beforeRestartAutomatic = await readSyncGroupControllerState(
      () => session.loadSyncTriggerResult()
    );
    await session.close();
    session = await openMacosSyncGroupDesktopSession({ env: macosAcceptanceEnv(),
      libraryHome: path.join(sharedRoot, 'macos-library'), repoRoot,
      runtimeRoot: path.join(sharedRoot, 'macos-runtime') });
    const restarted = await session.load();
    if (restarted.sync_group?.group_id !== initial.sync_group.group_id) {
      throw new Error('Mac did not restore its two-Device Sync Group.');
    }
    await waitForSyncGroupAutomaticRun(
      () => session.loadSyncTriggerResult(), beforeRestartAutomatic?.run_id
    );
    await session.invoke('sync_companion_now');
    const repeated = await session.invoke('load_workspace_list_snapshot', {
      includePdfOpenings: false
    });
    const repeatedIds = Object.values(repeated.nodesById).filter(({ title }) =>
      /^Multi-device sync [AC] fact/u.test(String(title))).map(({ id }) => id).sort();
    if (JSON.stringify(repeatedIds) !== JSON.stringify(factIds)) {
      throw new Error('Repeated Mac sync was not idempotent.');
    }
    await windowsProvider.release('consumer_complete');
    const windows = await windowsProvider.finish(); windowsSettled = true;
    const windowsReceipt = windows.receipt;
    const windowsEvidenceRoot = path.dirname(windows.evidenceRef);
    if (windowsReceipt.resultStatus !== 'success' || windowsReceipt.localDevicePersisted !== true
        || !automaticSnapshot?.nodesById?.[windowsReceipt.automaticFactId]) {
      throw new Error('Windows did not persist and automatically sync its accepted Device.');
    }
    const receipt = { acceptedTip, completedAt: new Date().toISOString(),
      deviceCount: accepted.sync_group?.devices?.length ?? 0,
      groupId: accepted.sync_group?.group_id ?? null,
      macosProviderPort: initial.server_status.port, requestId: request.request_id,
      journeyFacts: { macos: macosFact.factId, windows: windowsReceipt.journeyFactId,
        macosAutomatic: macosAutomaticFact.factId,
        windowsAutomatic: windowsReceipt.automaticFactId },
      providerServiceName: provider.serviceName,
      idempotent: true, macosRestarted: true,
      resultStatus: 'success', schemaVersion: 4, sharedRoot,
      windowsEvidenceRoot };
    const receiptPath = path.join(evidenceRoot, 'receipt.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    console.log(`[macos-windows-single-principal] status=success receipt=${receiptPath}`);
    return { receipt, receiptPath };
  } finally {
    await session.close().catch(() => undefined);
    if (windowsProvider && !windowsSettled) await windowsProvider.cancelAndSettle();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const creatorIndex = process.argv.indexOf('--creator');
  const creator = creatorIndex >= 0 ? process.argv[creatorIndex + 1] : 'macos';
  runMacosWindowsSinglePrincipalSyncGroup({ creator }).catch((error) => {
    console.error(`[macos-windows-single-principal] status=failed message=${error.message}`);
    process.exitCode = 1;
  });
}
