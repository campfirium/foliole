import { factObservation } from './sync-scenario-predicate.mjs';

export function desktopFactObservation(facts, factId, origin) {
  return factObservation(facts?.facts?.[factId] === true ? { [factId]: origin } : {});
}

export function assertParticipationState(overview, expected, groupId, fail) {
  if (overview.sync_group?.group_id !== groupId
      || overview.sync_enabled !== expected.enabled || overview.sync_paused !== expected.paused
      || overview.participating !== (expected.enabled && !expected.paused)) {
    throw fail(`macOS participation state is incomplete: ${JSON.stringify(overview)}`);
  }
}

export function assertAndroidResumeData(before, after, factId, fail) {
  const beforeDatabase = before.database;
  const afterDatabase = after.database;
  const beforeFacts = beforeDatabase?.inspection?.journeyFacts ?? {};
  const afterFacts = afterDatabase?.inspection?.journeyFacts ?? {};
  const counts = ['attachments', 'content_blobs', 'nodes'];
  const retained = Object.entries(beforeFacts)
    .every(([id, origin]) => afterFacts[id] === origin);
  if (afterDatabase?.integrity !== 'ok' || afterFacts[factId] !== 'A' || !retained
      || counts.some((key) => afterDatabase.counts[key] < beforeDatabase.counts[key])) {
    throw fail(`Android did not retain resumed data: ${JSON.stringify({
      after: afterDatabase, before: beforeDatabase, factId
    })}`);
  }
}

export function assertDesktopDepartureData(before, after, overview, fail) {
  const counts = ['attachmentCount', 'contentBlobCount', 'userNodeCount'];
  const localDeparture = after.departedAtByHost?.[before.localHostName];
  if (overview.sync_group !== null || overview.sync_enabled !== false
      || after.localGroupId !== null || after.localMemberState !== null
      || after.activeMemberCount !== before.activeMemberCount - 1 || !localDeparture
      || after.syncPeerCursorCount !== 0 || after.syncDeliveryReceiptCount !== 0
      || counts.some((key) => after[key] !== before[key])) {
    throw fail(`macOS departed state is incomplete: ${JSON.stringify({ after, overview })}`);
  }
}
