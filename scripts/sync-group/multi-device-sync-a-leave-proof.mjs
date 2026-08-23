import {
  assertLeaveContinuity, factObservation
} from './sync-scenario-predicate.mjs';

function assertAndroidSurvivorState(snapshot, expected) {
  const facts = snapshot.database?.inspection;
  if (snapshot.database?.integrity !== 'ok' || facts?.activeSyncGroupMemberCount !== 2
      || facts.syncGroupId !== expected.groupId || facts.syncGroupTimelineId !== expected.timelineId
      || facts.activeMemberHosts?.length !== 2
      || !facts.departedMemberHosts?.includes(expected.formerHostName)) {
    throw new Error('Android B did not preserve the two-member Sync Group.');
  }
  return facts;
}

function freshFactIds(journeyFacts, excluded) {
  const result = {};
  for (const [id, origin] of Object.entries(journeyFacts ?? {})) {
    if (excluded.has(id) || !['B', 'C'].includes(origin)) continue;
    if (result[origin]) throw new Error(`Multiple fresh ${origin} facts were observed.`);
    result[origin] = id;
  }
  return result;
}

export function projectAndroidConsumerProgress({ before, expected, snapshot }) {
  const facts = snapshot.database?.inspection ?? {};
  const excluded = new Set(Object.keys(before.database?.inspection?.journeyFacts ?? {}));
  return { active: facts.activeSyncGroupMemberCount, activeHosts: facts.activeMemberHosts?.length,
    departed: facts.departedMemberHosts?.includes(expected.formerHostName) ?? false,
    factIds: freshFactIds(facts.journeyFacts, excluded),
    group: facts.syncGroupId === expected.groupId, integrity: snapshot.database?.integrity,
    inventory: { before: [before.database?.inspection?.userNodeCount,
      before.database?.counts?.content_blobs, before.database?.counts?.attachments],
    current: [facts.userNodeCount, snapshot.database?.counts?.content_blobs,
      snapshot.database?.counts?.attachments] },
    missing: [facts.missingContentBlobCount, facts.missingAttachmentCount],
    timeline: facts.syncGroupTimelineId === expected.timelineId };
}

export function assertAndroidConsumerComplete({ before, snapshot }) {
  const facts = snapshot.database?.inspection ?? {};
  const excluded = new Set(Object.keys(before.database?.inspection?.journeyFacts ?? {}));
  const ids = freshFactIds(facts.journeyFacts, excluded);
  if (!ids.B || !ids.C) throw new Error('Android B has not consumed the exact survivor facts.');
  return ids;
}

export function assertSurvivorProof({ android, departed, factIds, runId, windows }) {
  const androidFacts = android.database?.inspection ?? {};
  const windowsFacts = windows.restarted;
  const survivorObservations = [factObservation(androidFacts.journeyFacts),
    factObservation(Object.fromEntries(Object.entries(windowsFacts.facts ?? {})
      .filter(([, present]) => present).map(([id]) => [id,
        id === factIds.B ? 'B' : id === factIds.C ? 'C' : null])))];
  const departedObservation = factObservation(Object.fromEntries(
    Object.entries(departed?.facts ?? {}).filter(([, present]) => present)
      .map(([id]) => [id, id === factIds.B ? 'B' : id === factIds.C ? 'C' : null])
  ));
  return ['B', 'C'].map((origin) => assertLeaveContinuity({
    departed: departedObservation,
    mutation: { factId: factIds[origin], origin, runId }, survivors: survivorObservations
  }));
}

export function matchesAndroidSurvivorState(snapshot, expected) {
  try { assertAndroidSurvivorState(snapshot, expected); return true; } catch { return false; }
}
