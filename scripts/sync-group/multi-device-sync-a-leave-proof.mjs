function assertAndroidSurvivorState(snapshot, expected) {
  const facts = snapshot.database?.inspection;
  if (snapshot.database?.integrity !== 'ok' || facts?.activeSyncGroupMemberCount !== 2
      || facts.syncGroupId !== expected.groupId || facts.syncGroupTimelineId !== expected.timelineId
      || facts.activeMemberIdentities?.length !== 2
      || !facts.departedMemberIdentities?.includes(expected.formerDeviceIdentity)) {
    throw new Error('Android B did not preserve the two-member Sync Group.');
  }
  return facts;
}

export function assertSurvivorProof({ android, baseline, factIds, formerDeviceIdentity, windows }) {
  const androidFacts = assertAndroidSurvivorState(android, {
    formerDeviceIdentity, groupId: baseline.groupId, timelineId: baseline.timelineId
  });
  const windowsFacts = windows.restarted;
  const windowsActive = Object.values(windowsFacts.activeDeviceIdentities ?? {}).flat().sort();
  const androidActive = [...androidFacts.activeMemberIdentities].sort();
  const inventories = [
    [androidFacts.userNodeCount, android.database.counts.content_blobs,
      android.database.counts.attachments],
    [windowsFacts.userNodeCount, windowsFacts.contentBlobCount, windowsFacts.attachmentCount]
  ];
  if (windowsFacts.activeMemberCount !== 2 || windowsFacts.localMemberState !== 'active'
      || windowsFacts.localGroupId !== baseline.groupId || windowsFacts.localTimelineId !== baseline.timelineId
      || windows.proof?.formerDeviceIdentity !== formerDeviceIdentity
      || JSON.stringify(windowsActive) !== JSON.stringify(androidActive)
      || Object.values(factIds).some((id) => !androidFacts.journeyFacts?.[id]
        || windowsFacts.facts?.[id] !== true)
      || new Set(inventories.map((value) => JSON.stringify(value))).size !== 1
      || inventories[0][0] < baseline.nodeCount + 2
      || inventories[0][1] < baseline.contentBlobCount + 2
      || inventories[0][2] < baseline.attachmentCount + 1) {
    throw new Error('B and C did not preserve complete bidirectional survivor convergence.');
  }
  return { activeMemberIdentities: androidActive, attachmentCount: inventories[0][2],
    contentBlobCount: inventories[0][1], formerAccessState: 'credentials_revoked',
    groupId: baseline.groupId, nodeCount: inventories[0][0], timelineId: baseline.timelineId };
}

export function matchesAndroidSurvivorState(snapshot, expected) {
  try { assertAndroidSurvivorState(snapshot, expected); return true; } catch { return false; }
}
