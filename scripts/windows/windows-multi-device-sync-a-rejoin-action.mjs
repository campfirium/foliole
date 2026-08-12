import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import { createSyncProgressWatchdog } from '../sync-group/sync-progress-watchdog.mjs';

function freshFactIds(facts, excluded) {
  return Object.entries(facts?.journeyFacts ?? {}).filter(([id]) => !excluded.has(id))
    .reduce((result, [id, origin]) => ({ ...result, [origin]: id }), {});
}

function assertComplete(facts, ids) {
  if (facts.activeMemberCount !== 3 || facts.localMemberState !== 'active'
      || !facts.localGroupId || !facts.localTimelineId || facts.missingAttachmentCount !== 0
      || facts.missingContentBlobCount !== 0
      || Object.values(ids).some((id) => facts.facts?.[id] !== true)) {
    throw new Error(`Windows C A-rejoin state is incomplete: ${JSON.stringify(facts)}`);
  }
}

async function waitForFreshFacts(execute, inspect, paths, excluded, origins, factIds = [],
  timeoutMs = 12 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  const observe = createSyncProgressWatchdog({ label: 'Windows C A-rejoin convergence', stallMs: 60_000 });
  let facts;
  while (Date.now() < deadline) {
    facts = await inspect(execute, paths, undefined, factIds);
    const fresh = freshFactIds(facts, excluded);
    observe(JSON.stringify([facts.activeMemberCount, fresh, facts.facts]), facts);
    const resourcesComplete = factIds.length === 0 || (facts.missingAttachmentCount === 0
      && facts.missingContentBlobCount === 0);
    if (facts.activeMemberCount === 3 && origins.every((origin) => fresh[origin])
        && factIds.every((id) => facts.facts[id] === true) && resourcesComplete) return { facts, fresh };
    await delay(1_000);
  }
  throw new Error(`Windows C timed out during A rejoin: ${JSON.stringify(facts)}`);
}

async function withSession(paths, evidenceRoot, openSession, action) {
  const opened = await openSession(paths, evidenceRoot);
  try { return await action(opened); } finally { await opened.app.close(); }
}

export async function runWindowsMultiDeviceSyncARejoin({ evidenceRoot, execute, paths,
  control, createFact = createDesktopSyncGroupJourneyFact, inspect, invoke, openSession, restore, suspend }) {
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
    const excluded = new Set(Object.keys(initial.journeyFacts ?? {}));
    const ab = await withSession(paths, evidenceRoot, openSession, () => waitForFreshFacts(
      execute, inspect, paths, excluded, ['A', 'B']
    ));
    const created = await withSession(paths, evidenceRoot, openSession, ({ page }) =>
      createFact({ device: 'C', evidenceRoot, session: {
        invoke: (command, args) => invoke(page, command, args)
      } }));
    const ids = { A: ab.fresh.A, B: ab.fresh.B, C: created.factId };
    const converged = await withSession(paths, evidenceRoot, openSession, async () => {
      const value = (await waitForFreshFacts(execute, inspect, paths, excluded, ['A', 'B', 'C'],
        Object.values(ids))).facts;
      assertComplete(value, ids); return value;
    });
    const restarted = await withSession(paths, evidenceRoot, openSession, async () => {
      const value = (await waitForFreshFacts(execute, inspect, paths, excluded, ['A', 'B', 'C'],
        Object.values(ids))).facts;
      assertComplete(value, ids); return value;
    });
    const receiptPath = path.join(evidenceRoot, 'multi-device-sync-a-rejoin-receipt.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify({ completedAt: new Date().toISOString(),
      converged, factIds: ids, initialJourneyFacts: initial.journeyFacts,
      restarted, resultStatus: 'success', schemaVersion: 1
    }, null, 2)}\n`, 'utf8');
    result = { multiDeviceSyncARejoin: { manifestPath: receiptPath }, output: '' };
  } catch (error) { primaryError = error; }
  try { await restore({ control, execute, paths, suspended }); }
  catch (cleanupError) {
    if (primaryError) primaryError.message += `; cleanup: ${cleanupError.message}`;
    else primaryError = cleanupError;
  }
  if (primaryError) throw primaryError;
  return result;
}
