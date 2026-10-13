import fs from 'node:fs';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';

import { createSyncProgressWatchdog } from '../sync-group/sync-progress-watchdog.mjs';
import {
  assertSyncFromZeroCommittedFacts, assertSyncFromZeroDatasetFacts, SYNC_FROM_ZERO_DATASET
} from '../sync-group/sync-from-zero-contract.mjs';
import {
  restoreWindowsNativeClient, suspendWindowsNativeClient
} from './windows-sync-group-native-lifecycle.mjs';
import { enableWindowsSyncParticipation } from './windows-sync-group-participation-control.mjs';
import { closeWindowsSyncGroupSession } from './windows-sync-group-session-close.mjs';
import {
  controlWindowsNativeClient, discoverUniqueGroup, inspectWindowsSyncGroupDatabase,
  invokeWindowsSyncGroupCommand, openWindowsSyncGroupSession, resetOwnedClient
} from './windows-sync-group-recovery-action.mjs';

function assertEmptyDataset(facts) {
  if (facts.datasetNodeCount !== 0 || facts.datasetAttachmentCount !== 0) {
    throw new Error(`Windows C did not start from an empty dataset: ${JSON.stringify(facts)}`);
  }
}

function assertCommittedPartial(facts) {
  if (facts.datasetNodeCount <= 0 || facts.datasetNodeCount >= SYNC_FROM_ZERO_DATASET.nodeCount
      || facts.datasetNodeIds?.length !== facts.datasetNodeCount
      || facts.datasetContentHashes?.length !== facts.datasetNodeCount) {
    throw new Error(`Windows C did not expose a committed partial sync boundary: ${JSON.stringify(facts)}`);
  }
}

function assertJoinedGroup(facts, expectedGroupId) {
  if (facts.localGroupId !== expectedGroupId || facts.localMemberState !== 'active'
      || facts.activeMemberCount !== 3) {
    throw new Error(`Windows C did not persist active membership: ${JSON.stringify(facts)}`);
  }
}

function isAndroidProvider(candidate) {
  return candidate.provider_device_kind === 'android-capacitor';
}

async function waitForFacts(label, inspect, accept, onObserved = () => {}, timeoutMs = 12 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  const observe = createSyncProgressWatchdog({ label, stallMs: 90_000 });
  let facts = null;
  while (Date.now() < deadline) {
    facts = await inspect();
    const state = [facts.datasetNodeCount,
      facts.datasetCachedContentBlobCount, facts.datasetCachedAttachmentCount];
    observe(JSON.stringify(state), facts);
    onObserved(facts);
    if (accept(facts)) return facts;
    await delay(250);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(facts)}`);
}

function waitForObjectCommitSignal(signal, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Windows C did not report its first committed dataset object.'));
    }, timeoutMs);
    signal.then((value) => {
      clearTimeout(timer); resolve(value);
    }, (error) => {
      clearTimeout(timer); reject(error);
    });
  });
}

function waitForCompleteFacts(inspect, reportProgress) {
  let contentReported = false;
  let attachmentsReported = false;
  return waitForFacts('Windows C resumed dataset', inspect, (facts) => {
    if (!contentReported && facts.datasetCachedContentBlobCount === SYNC_FROM_ZERO_DATASET.nodeCount) {
      contentReported = true; reportProgress('c-content-batches-received');
    }
    if (!attachmentsReported
        && facts.datasetCachedAttachmentCount === SYNC_FROM_ZERO_DATASET.attachmentCount) {
      attachmentsReported = true; reportProgress('c-attachment-batches-received');
    }
    try { assertSyncFromZeroDatasetFacts(facts); return facts.activeMemberCount === 3
      && facts.localMemberState === 'active' && facts.integrity === 'ok'
      && facts.missingAttachmentCount === 0 && facts.missingContentBlobCount === 0;
    } catch { return false; }
  });
}

export async function runWindowsSyncFromZeroJourney(actions) {
  const report = (milestone) => actions.reportProgress({ factId: 'sync-from-zero', milestone });
  const initialFacts = await actions.reset();
  assertEmptyDataset(initialFacts); report('c-dataset-empty');
  let session = await actions.openSession({ holdAfterObjectCommit: true });
  try {
    await actions.enable(session.page);
    const candidate = await actions.discover(session.page); report('c-group-discovered');
    await actions.requestJoin(session.page, candidate.endpoint_url); report('c-join-requested');
    await actions.waitForObjectCommitted(session.objectCommitted);
    await actions.closeSession(session, { force: true }); session = null;
    const interruptedFacts = await actions.inspect();
    assertCommittedPartial(interruptedFacts);
    assertJoinedGroup(interruptedFacts, candidate.group_id);
    const firstCommittedFacts = interruptedFacts;
    report('c-membership-active');
    report('c-first-object-committed'); report('c-object-batches-received');
    report('c-controlled-interruption');
    session = await actions.openSession();
    const restartedFacts = await actions.inspect();
    assertSyncFromZeroCommittedFacts({ initialFacts, firstCommittedFacts, interruptedFacts, restartedFacts });
    report('c-restarted-with-committed-objects');
    const finalFacts = await actions.waitForComplete(report);
    const receipt = { candidate: { groupId: candidate.group_id,
      providerKind: candidate.provider_device_kind }, finalFacts, firstCommittedFacts,
    initialFacts, interruptedFacts, restartedFacts, resultStatus: 'success', schemaVersion: 1 };
    assertSyncFromZeroCommittedFacts(receipt);
    return receipt;
  } finally {
    if (session) await actions.closeSession(session).catch(() => undefined);
  }
}

export async function runWindowsMultiDeviceSyncFromZero({ evidenceRoot, execute, paths,
  reportProgress = () => {} }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const suspended = await suspendWindowsNativeClient({
    control: controlWindowsNativeClient, execute, paths
  });
  let primaryError = null;
  let receipt = null;
  try {
    const inspect = () => inspectWindowsSyncGroupDatabase(execute, paths);
    receipt = await runWindowsSyncFromZeroJourney({
      discover: (page) => discoverUniqueGroup(page, 60_000, isAndroidProvider),
      closeSession: closeWindowsSyncGroupSession,
      enable: (page) => enableWindowsSyncParticipation(page, invokeWindowsSyncGroupCommand),
      inspect,
      openSession: (options) => openWindowsSyncGroupSession(paths, evidenceRoot, undefined, options),
      reportProgress,
      requestJoin: (page, endpoint_url) => invokeWindowsSyncGroupCommand(
        page, 'request_sync_group_join', { endpoint_url, mode: 'use-group' }
      ),
      reset: () => resetOwnedClient(paths, evidenceRoot, execute),
      waitForComplete: (report) => waitForCompleteFacts(inspect, report),
      waitForObjectCommitted: waitForObjectCommitSignal
    });
  } catch (error) { primaryError = error; }
  try {
    await restoreWindowsNativeClient({ control: controlWindowsNativeClient, execute, paths, suspended });
  } catch (error) {
    if (primaryError) primaryError.message += `; cleanup: ${error.message}`;
    else primaryError = error;
  }
  if (primaryError) throw primaryError;
  const manifestPath = path.join(evidenceRoot, 'multi-device-sync-from-zero-receipt.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { multiDeviceSyncFromZero: { manifestPath }, output: '' };
}
