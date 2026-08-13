import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { createSyncProgressWatchdog } from '../sync-group/sync-progress-watchdog.mjs';
import {
  controlWindowsNativeClient, inspectWindowsSyncGroupDatabase, invokeWindowsSyncGroupCommand,
  openWindowsSyncGroupSession
} from './windows-sync-group-recovery-action.mjs';
import {
  restoreWindowsNativeClient, suspendWindowsNativeClient
} from './windows-sync-group-native-lifecycle.mjs';
import { waitForWindowsSyncGroupProviderRelease } from './windows-sync-group-provider-release.mjs';

const ACTION = 'multi-device-sync-participation';

function assertParticipation(overview, expected, groupId) {
  if (overview.sync_group?.group_id !== groupId
      || overview.sync_group.local_member_state !== 'active'
      || overview.sync_enabled !== expected.enabled
      || overview.sync_paused !== expected.paused
      || overview.participating !== (expected.enabled && !expected.paused)) {
    throw new Error(`Windows participation state is incomplete: ${JSON.stringify(overview)}`);
  }
}

function assertDataRetained(before, after) {
  const counts = ['attachmentCount', 'contentBlobCount', 'userNodeCount'];
  if (after.integrity !== 'ok' || counts.some((key) => after[key] !== before[key])
      || after.missingAttachmentCount !== 0 || after.missingContentBlobCount !== 0) {
    throw new Error(`Windows local data was not retained: ${JSON.stringify({ after, before })}`);
  }
}

export function isWindowsLastMemberInputReady(facts) {
  return facts.activeMemberCount === 1 && facts.localMemberState === 'active'
    && facts.missingAttachmentCount === 0 && facts.missingContentBlobCount === 0;
}

async function withSession(paths, evidenceRoot, action) {
  const opened = await openWindowsSyncGroupSession(paths, evidenceRoot);
  try { return await action(opened.page); } finally { await opened.app.close(); }
}

async function waitUntil(label, inspect, accept, timeoutMs = 12 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  const observe = createSyncProgressWatchdog({ label, stallMs: 60_000 });
  let value;
  while (Date.now() < deadline) {
    value = await inspect();
    observe(JSON.stringify(value), value);
    if (accept(value)) return value;
    await delay(1_000);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(value)}`);
}

async function proveParticipationCycle(options, initial) {
  const { evidenceRoot, execute, paths, reportProgress } = options;
  await withSession(paths, evidenceRoot, async (page) => {
    const paused = await invokeWindowsSyncGroupCommand(page, 'pause_companion_sync');
    assertParticipation(paused, { enabled: true, paused: true }, initial.localGroupId);
  });
  await withSession(paths, evidenceRoot, async (page) => {
    const restarted = await invokeWindowsSyncGroupCommand(page, 'load_companion_pairing_overview');
    assertParticipation(restarted, { enabled: true, paused: true }, initial.localGroupId);
    reportProgress({ factId: 'participation-control', milestone: 'windows-paused' });
    await waitForWindowsSyncGroupProviderRelease({ action: ACTION, repoRoot: paths.repoRoot });
    const resumed = await invokeWindowsSyncGroupCommand(page, 'resume_companion_sync');
    assertParticipation(resumed, { enabled: true, paused: false }, initial.localGroupId);
    await waitUntil('Windows resumed cursor convergence',
      () => inspectWindowsSyncGroupDatabase(execute, paths),
      (facts) => Object.entries(facts.journeyFacts ?? {}).some(([id, origin]) =>
        origin === 'A' && !Object.hasOwn(initial.journeyFacts ?? {}, id)));
    const disabled = await invokeWindowsSyncGroupCommand(page, 'disable_companion_sync');
    assertParticipation(disabled, { enabled: false, paused: false }, initial.localGroupId);
  });
  return withSession(paths, evidenceRoot, async (page) => {
    const restarted = await invokeWindowsSyncGroupCommand(page, 'load_companion_pairing_overview');
    assertParticipation(restarted, { enabled: false, paused: false }, initial.localGroupId);
    const enabled = await invokeWindowsSyncGroupCommand(page, 'enable_companion_sync');
    assertParticipation(enabled, { enabled: true, paused: false }, initial.localGroupId);
    await waitUntil('Windows macOS departure convergence',
      () => inspectWindowsSyncGroupDatabase(execute, paths),
      (facts) => facts.activeMemberCount === 2 && facts.localMemberState === 'active');
    reportProgress({ factId: 'participation-control', milestone: 'macos-departure-observed' });
    await waitUntil('Windows last-member input',
      () => inspectWindowsSyncGroupDatabase(execute, paths),
      isWindowsLastMemberInputReady);
    const beforeLeave = await inspectWindowsSyncGroupDatabase(execute, paths);
    await invokeWindowsSyncGroupCommand(page, 'disable_companion_sync');
    const left = await invokeWindowsSyncGroupCommand(page, 'leave_sync_group');
    if (left.sync_group !== null || left.sync_enabled !== false) {
      throw new Error(`Windows last-member Leave did not unbind locally: ${JSON.stringify(left)}`);
    }
    return beforeLeave;
  });
}

async function verifyRestartedDeparture(options, initial) {
  const { evidenceRoot, execute, paths } = options;
  return withSession(paths, evidenceRoot, async (page) => {
    const overview = await invokeWindowsSyncGroupCommand(page, 'load_companion_pairing_overview');
    const after = await inspectWindowsSyncGroupDatabase(execute, paths);
    if (overview.sync_group !== null || overview.paired_devices.length !== 0
        || after.localGroupId !== null || after.localMemberState !== null
        || after.activeMemberCount !== 0 || after.syncDeliveryReceiptCount !== 0
        || after.syncPeerCursorCount !== 0) {
      throw new Error(`Windows departed state revived or retained progress: ${JSON.stringify({ after, overview })}`);
    }
    assertDataRetained(initial, after);
    return { after, overview: { syncEnabled: overview.sync_enabled, syncPaused: overview.sync_paused } };
  });
}

export async function runWindowsMultiDeviceSyncParticipation(options) {
  const { evidenceRoot, execute, paths } = options;
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const suspended = await suspendWindowsNativeClient({
    control: controlWindowsNativeClient, execute, paths
  });
  let primaryError;
  let result;
  try {
    const initial = await inspectWindowsSyncGroupDatabase(execute, paths);
    if (initial.activeMemberCount !== 3 || initial.localMemberState !== 'active') {
      throw new Error(`Windows participation input is incomplete: ${JSON.stringify(initial)}`);
    }
    const beforeLeave = await proveParticipationCycle(options, initial);
    const restarted = await verifyRestartedDeparture(options, beforeLeave);
    const receiptPath = path.join(evidenceRoot, 'multi-device-sync-participation-receipt.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify({ completedAt: new Date().toISOString(),
      initial, restarted, resultStatus: 'success', schemaVersion: 1
    }, null, 2)}\n`, 'utf8');
    result = { multiDeviceSyncParticipation: { manifestPath: receiptPath }, output: '' };
  } catch (error) { primaryError = error; }
  try {
    await restoreWindowsNativeClient({
      control: controlWindowsNativeClient, execute, paths, suspended
    });
  } catch (cleanupError) {
    if (primaryError) primaryError.message += `; cleanup: ${cleanupError.message}`;
    else primaryError = cleanupError;
  }
  if (primaryError) throw primaryError;
  return result;
}
