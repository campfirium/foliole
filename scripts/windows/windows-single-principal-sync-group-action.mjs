/* global console */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { provisionWindowsAcceptanceRoot } from './windows-multi-device-sync-readiness.mjs';
import {
  discoverUniqueGroup, invokeWindowsSyncGroupCommand, openWindowsSyncGroupSession,
  windowsSyncGroupClientPaths
} from './windows-sync-group-recovery-action.mjs';
import { closeWindowsSyncGroupSession } from './windows-sync-group-session-close.mjs';
import {
  assertJoinedWindowsGroup
} from './windows-single-principal-sync-group-contract.mjs';

async function completeAcceptedJoin(page, timeoutMs = 10 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try { return await invokeWindowsSyncGroupCommand(page, 'complete_sync_group_join'); }
    catch (error) {
      lastError = error;
      await delay(500);
    }
  }
  throw new Error(`Windows Device acceptance timed out: ${lastError?.message ?? 'unknown'}`);
}

export async function runWindowsSinglePrincipalSyncGroup(options) {
  provisionWindowsAcceptanceRoot({ paths: options.paths });
  const client = windowsSyncGroupClientPaths(options.paths);
  fs.rmSync(path.dirname(client.libraryHome), { force: true, recursive: true });
  fs.mkdirSync(client.libraryHome, { recursive: true });
  fs.mkdirSync(client.userData, { recursive: true });
  let session = await openWindowsSyncGroupSession(options.paths, options.evidenceRoot);
  let candidate;
  let firstGroup;
  try {
    await invokeWindowsSyncGroupCommand(session.page, 'enable_companion_sync');
    candidate = await discoverUniqueGroup(session.page);
    await invokeWindowsSyncGroupCommand(session.page, 'request_sync_group_join', {
      endpoint_url: candidate.endpoint_url
    });
    console.log(`[windows-dev-action] progress action=single-principal-sync-group milestone=requested group=${candidate.group_id}`);
    firstGroup = assertJoinedWindowsGroup(await completeAcceptedJoin(session.page), candidate.group_id);
  } finally { await closeWindowsSyncGroupSession(session); }
  session = await openWindowsSyncGroupSession(options.paths, options.evidenceRoot);
  let restartedGroup;
  try {
    restartedGroup = assertJoinedWindowsGroup(await invokeWindowsSyncGroupCommand(
      session.page, 'load_sync_group_overview'
    ), candidate.group_id);
  } finally { await closeWindowsSyncGroupSession(session); }
  const manifestPath = path.join(options.evidenceRoot,
    'single-principal-sync-group-receipt.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ buildIdentity: options.buildIdentity,
    completedAt: new Date().toISOString(), deviceCount: restartedGroup.devices.length,
    groupId: restartedGroup.group_id,
    localDeviceIdentityKey: restartedGroup.local_device_identity_key,
    localDevicePersisted: firstGroup.local_device_identity_key
      === restartedGroup.local_device_identity_key,
    resultStatus: 'success', schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { output: '', singlePrincipalSyncGroup: { manifestPath } };
}
