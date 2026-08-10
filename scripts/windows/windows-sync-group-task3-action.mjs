import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import {
  controlWindowsNativeClient, inspectWindowsSyncGroupDatabase, invokeWindowsSyncGroupCommand,
  openWindowsSyncGroupSession
} from './windows-sync-group-recovery-action.mjs';
import {
  restoreWindowsNativeClient, suspendWindowsNativeClient
} from './windows-sync-group-native-lifecycle.mjs';
import { createSyncProgressWatchdog } from '../sync-group/sync-progress-watchdog.mjs';

function hasOrigin(facts, origin, excluded) {
  return Object.entries(facts?.journeyFacts ?? {}).some(([id, value]) =>
    value === origin.toUpperCase() && !excluded.has(id));
}

function assertComplete(facts, factId = null) {
  if (facts.activeMemberCount !== 3 || facts.localMemberState !== 'active'
      || !facts.localGroupId || !facts.localTimelineId || facts.missingAttachmentCount !== 0
      || facts.missingContentBlobCount !== 0 || (factId && facts.facts?.[factId] !== true)) {
    throw new Error(`Windows C task 3 state is incomplete: ${JSON.stringify(facts)}`);
  }
}

async function waitForFacts(execute, paths, origins, excluded, factIds = [], timeoutMs = 12 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  const observe = createSyncProgressWatchdog({
    label: 'Windows C task 3 fact convergence', stallMs: 60_000
  });
  let facts;
  while (Date.now() < deadline) {
    facts = await inspectWindowsSyncGroupDatabase(execute, paths, undefined, factIds);
    observe(JSON.stringify([facts.activeMemberCount, facts.journeyFacts, facts.facts]), facts);
    if (origins.every((origin) => hasOrigin(facts, origin, excluded))
        && factIds.every((id) => facts.facts[id] === true)) return facts;
    await delay(1_000);
  }
  throw new Error(`Windows C timed out waiting for task 3 facts: ${JSON.stringify(facts)}`);
}

async function runSession(paths, evidenceRoot, action) {
  const opened = await openWindowsSyncGroupSession(paths, evidenceRoot);
  try {
    return await action({ invoke: (command, args) => invokeWindowsSyncGroupCommand(
      opened.page, command, args
    ) });
  } finally { await opened.app.close(); }
}

export async function runWindowsSyncGroupTask3({ evidenceRoot, execute, paths }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const suspended = await suspendWindowsNativeClient({
    control: controlWindowsNativeClient, execute, paths
  });
  let primaryError;
  let result;
  try {
    const initial = await inspectWindowsSyncGroupDatabase(execute, paths);
    const excluded = new Set(Object.keys(initial.journeyFacts ?? {}));
    await runSession(paths, evidenceRoot, async () => waitForFacts(
      execute, paths, ['a', 'b'], excluded
    ));
    const created = await runSession(paths, evidenceRoot, (session) =>
      createDesktopSyncGroupJourneyFact({ device: 'C', evidenceRoot, session }));
    const converged = await runSession(paths, evidenceRoot, async () => {
      const facts = await waitForFacts(execute, paths, ['a', 'b', 'c'], excluded, [created.factId]);
      assertComplete(facts, created.factId);
      return facts;
    });
    const restarted = await runSession(paths, evidenceRoot, async () => {
      const facts = await waitForFacts(execute, paths, ['a', 'b', 'c'], excluded, [created.factId]);
      assertComplete(facts, created.factId);
      return facts;
    });
    const receiptPath = path.join(evidenceRoot, 'sync-group-task3-receipt.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify({ completedAt: new Date().toISOString(),
      converged, factId: created.factId, initialJourneyFacts: initial.journeyFacts,
      restarted, resultStatus: 'success', schemaVersion: 1
    }, null, 2)}\n`, 'utf8');
    result = { output: '', syncGroupTask3: { receiptPath } };
  } catch (error) { primaryError = error; }
  finally {
    try { await restoreWindowsNativeClient({
      control: controlWindowsNativeClient, execute, paths, suspended
    }); }
    catch (cleanupError) {
      if (primaryError) primaryError.message += `; cleanup: ${cleanupError.message}`;
      else primaryError = cleanupError;
    }
  }
  if (primaryError) throw primaryError;
  return result;
}
