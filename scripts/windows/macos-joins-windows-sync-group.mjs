import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { openMacosSyncGroupDesktopSession } from '../android/macos-sync-group-desktop-session.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import { createActionExecutor } from '../sync-group/multi-device-sync-action-executor.mjs';
import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';
import { startWindowsSyncGroupProvider } from '../sync-group/multi-device-sync-windows-provider.mjs';

function factCount(snapshot, origin) {
  return Object.values(snapshot?.nodesById ?? {}).filter(({ title }) =>
    String(title).startsWith(`Multi-device sync ${origin} fact`)).length;
}

async function waitForFacts(session, counts, timeoutMs = 5 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let snapshot;
  while (Date.now() < deadline) {
    snapshot = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
    if (Object.entries(counts).every(([origin, count]) => factCount(snapshot, origin) >= count)) {
      return snapshot;
    }
    await delay(250);
  }
  throw new Error(`Mac business facts did not converge: ${JSON.stringify(counts)}`);
}

async function discoverWindows(session, timeoutMs = 2 * 60_000) {
  await session.invoke('discover_sync_groups');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const overview = await session.load();
    const candidates = overview.join_candidates ?? [];
    if (candidates.length > 1) throw new Error('Mac discovered multiple task Sync Groups.');
    if (candidates.length === 1) return candidates[0];
    await delay(250);
  }
  throw new Error('Mac did not discover the Windows Sync Group.');
}

async function completeJoin(session, groupId, timeoutMs = 5 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const overview = await session.invoke('complete_sync_group_join');
      if (overview.sync_group?.group_id === groupId) return overview;
    } catch (error) { lastError = error; }
    await delay(250);
  }
  throw new Error(`Mac Device acceptance timed out: ${lastError?.message ?? 'unknown'}`);
}

function openSession(repoRoot, sharedRoot) {
  return openMacosSyncGroupDesktopSession({ env: macosAcceptanceEnv(),
    libraryHome: path.join(sharedRoot, 'macos-library'), repoRoot,
    runtimeRoot: path.join(sharedRoot, 'macos-runtime') });
}

export async function runMacosJoinsWindowsSyncGroup({ acceptedTip, evidenceRoot, repoRoot,
  sharedRoot }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const execute = createActionExecutor({ logPath: path.join(evidenceRoot, 'windows-action.log'),
    progressPath: path.join(evidenceRoot, 'windows-progress.jsonl') });
  const provider = startWindowsSyncGroupProvider({ action: 'two-device-sync-provider',
    execute, repoRoot });
  let providerSettled = false;
  let session;
  try {
    await provider.waitForProgress('provider-ready');
    session = await openSession(repoRoot, sharedRoot);
    const initialFact = await createDesktopSyncGroupJourneyFact({ device: 'B',
      evidenceRoot: path.join(evidenceRoot, 'macos-initial-fact'), session });
    const candidate = await discoverWindows(session);
    await session.invoke('request_sync_group_join', { endpoint_url: candidate.endpoint_url });
    const pending = (await session.load()).join_request;
    if (!pending || JSON.stringify(pending).includes('workgroup_key')) {
      throw new Error('Mac pending join state did not remain key-free.');
    }
    await provider.waitForProgress('accepted');
    const joined = await completeJoin(session, candidate.group_id);
    await waitForFacts(session, { A: 1, B: 1 });
    const automaticFact = await createDesktopSyncGroupJourneyFact({ device: 'B',
      evidenceRoot: path.join(evidenceRoot, 'macos-automatic-fact'), session });
    await provider.waitForProgress('automatic-converged');
    await waitForFacts(session, { A: 2, B: 2 });
    await session.invoke('sync_companion_now');
    await session.invoke('sync_companion_now');
    await session.close(); session = await openSession(repoRoot, sharedRoot);
    const restarted = await session.load();
    if (restarted.sync_group?.group_id !== candidate.group_id) {
      throw new Error('Mac did not restore the Windows-created Sync Group.');
    }
    await waitForFacts(session, { A: 2, B: 2 });
    await provider.release('consumer_complete');
    const windows = await provider.finish(); providerSettled = true;
    const receipt = { acceptedTip, automaticFactId: automaticFact.factId,
      completedAt: new Date().toISOString(), deviceCount: joined.sync_group.devices.length,
      groupId: candidate.group_id, initialFactId: initialFact.factId,
      resultStatus: 'success', schemaVersion: 1, sharedRoot,
      windowsEvidenceRoot: path.dirname(windows.evidenceRef) };
    const receiptPath = path.join(evidenceRoot, 'receipt.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    return { receipt, receiptPath };
  } finally {
    await session?.close().catch(() => undefined);
    if (!providerSettled) await provider.cancelAndSettle();
  }
}
