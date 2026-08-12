import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import { createSyncProgressWatchdog } from '../sync-group/sync-progress-watchdog.mjs';

const RESOURCE_SETTLEMENT_WINDOW_MS = 15_000;

function identities(value) {
  return Object.values(value ?? {}).flat().sort();
}

function factIdsSince(facts, notBefore) {
  return Object.entries(facts?.journeyFacts ?? {}).reduce((result, [id, origin]) => {
    const updatedAt = String(facts.journeyFactUpdates?.[id] ?? '');
    const current = result[origin];
    return updatedAt >= notBefore
      && (!current || updatedAt >= String(facts.journeyFactUpdates?.[current] ?? ''))
      ? { ...result, [origin]: id } : result;
  }, {});
}

function assertInitialState(facts) {
  if (![2, 3].includes(facts.activeMemberCount) || facts.localMemberState !== 'active'
      || !facts.localGroupId || !facts.localTimelineId) {
    throw new Error(`Windows C does not have the required survivor input: ${JSON.stringify(facts)}`);
  }
}

export function assertWindowsSurvivorState({ facts, initial, ids = [] }) {
  const activeMembers = identities(facts.activeDeviceIdentities);
  const departedMembers = identities(facts.departedDeviceIdentities);
  const formerMembers = departedMembers.filter((value) => !activeMembers.includes(value));
  const formerLeftAt = facts.departedAtByDeviceIdentity?.[formerMembers[0]];
  if (facts.activeMemberCount !== 2 || facts.localMemberState !== 'active'
      || facts.localGroupId !== initial.localGroupId || facts.localTimelineId !== initial.localTimelineId
      || activeMembers.length !== 2 || !activeMembers.includes(facts.deviceIdentity)
      || formerMembers.length !== 1 || !formerLeftAt
      || facts.integrity !== 'ok' || facts.missingAttachmentCount !== 0
      || facts.missingContentBlobCount !== 0 || ids.some((id) => facts.facts?.[id] !== true)) {
    throw new Error(`Windows C did not preserve the two-member Sync Group: ${JSON.stringify(facts)}`);
  }
  return { activeMembers, formerDeviceIdentity: formerMembers[0], formerLeftAt };
}

async function inspectUntil({ accept, execute, inspect, label, paths, progress, timeoutMs = 12 * 60_000 }) {
  const deadline = Date.now() + timeoutMs;
  const observe = createSyncProgressWatchdog({ label, stallMs: 60_000 });
  let facts;
  while (Date.now() < deadline) {
    facts = await inspect(execute, paths, undefined, progress.factIds ?? []);
    observe(JSON.stringify(progress.value(facts)), facts);
    if (accept(facts)) return facts;
    await delay(1_000);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(facts)}`);
}

async function withSession(paths, evidenceRoot, openSession, action) {
  const opened = await openSession(paths, evidenceRoot);
  try { return await action(opened); } finally { await opened.app.close(); }
}

async function runContinuousSession(options, initial) {
  const { createFact, evidenceRoot, execute, inspect, invoke, openSession, paths } = options;
  return withSession(paths, evidenceRoot, openSession, async ({ page }) => {
    const departed = await inspectUntil({ execute, inspect,
      accept: (facts) => {
        try { assertWindowsSurvivorState({ facts, initial }); return true; } catch { return false; }
      }, label: 'Windows C A-leave departure', paths,
      progress: { value: (facts) => [facts.activeMemberCount, facts.departedDeviceIdentities] } });
    const departure = assertWindowsSurvivorState({ facts: departed, initial });
    const created = await createFact({ device: 'C', evidenceRoot, session: {
      invoke: (command, args) => invoke(page, command, args)
    }, withAttachment: true });
    const converged = await inspectUntil({ execute, inspect,
      accept: (facts) => {
        const fresh = factIdsSince(facts, departure.formerLeftAt);
        const ids = [fresh.B, created.factId].filter(Boolean);
        try {
          assertWindowsSurvivorState({ facts, initial, ids });
          return fresh.B && fresh.C === created.factId;
        } catch { return false; }
      }, label: 'Windows C survivor convergence', paths,
      progress: { value: (facts) => [facts.activeMemberCount,
        factIdsSince(facts, departure.formerLeftAt),
        facts.missingAttachmentCount, facts.missingContentBlobCount] } });
    const fresh = factIdsSince(converged, departure.formerLeftAt);
    return { converged, departed, ids: { B: fresh.B, C: created.factId } };
  });
}

export async function runWindowsMultiDeviceSyncALeave({ evidenceRoot, execute, paths,
  control, createFact = createDesktopSyncGroupJourneyFact, inspect, invoke, openSession, restore,
  settle = delay, suspend }) {
  const recovery = control && inspect && invoke && openSession ? null
    : await import('./windows-sync-group-recovery-action.mjs');
  const lifecycle = restore && suspend ? null : await import('./windows-sync-group-native-lifecycle.mjs');
  control ??= recovery.controlWindowsNativeClient;
  inspect ??= recovery.inspectWindowsSyncGroupDatabase;
  invoke ??= recovery.invokeWindowsSyncGroupCommand;
  openSession ??= recovery.openWindowsSyncGroupSession;
  restore ??= lifecycle.restoreWindowsNativeClient;
  suspend ??= lifecycle.suspendWindowsNativeClient;
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const suspended = await suspend({ control, execute, paths });
  let primaryError;
  let result;
  try {
    const initial = await inspect(execute, paths);
    assertInitialState(initial);
    const continuous = await runContinuousSession({ createFact, evidenceRoot, execute,
      inspect, invoke, openSession, paths }, initial);
    const restarted = await withSession(paths, evidenceRoot, openSession, async () => inspectUntil({
      accept: (facts) => {
        try { assertWindowsSurvivorState({ facts, initial, ids: Object.values(continuous.ids) }); return true; }
        catch { return false; }
      }, execute, inspect, label: 'Windows C restarted survivor state', paths,
      progress: { factIds: Object.values(continuous.ids), value: (facts) => [facts.activeMemberCount,
        facts.facts, facts.missingAttachmentCount, facts.missingContentBlobCount] }
    }));
    await settle(RESOURCE_SETTLEMENT_WINDOW_MS);
    const receiptPath = path.join(evidenceRoot, 'multi-device-sync-a-leave-receipt.json');
    const proof = assertWindowsSurvivorState({ facts: restarted, initial,
      ids: Object.values(continuous.ids) });
    fs.writeFileSync(receiptPath, `${JSON.stringify({ completedAt: new Date().toISOString(),
      converged: continuous.converged, factIds: continuous.ids, initial, proof, restarted,
      resultStatus: 'success', schemaVersion: 1
    }, null, 2)}\n`, 'utf8');
    result = { multiDeviceSyncALeave: { manifestPath: receiptPath }, output: '' };
  } catch (error) { primaryError = error; }
  try { await restore({ control, execute, paths, suspended }); }
  catch (cleanupError) {
    if (primaryError) primaryError.message += `; cleanup: ${cleanupError.message}`;
    else primaryError = cleanupError;
  }
  if (primaryError) throw primaryError;
  return result;
}
