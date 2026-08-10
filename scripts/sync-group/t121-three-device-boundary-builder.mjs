import { createAcceptanceManifest } from './t121-three-device-acceptance-contract.mjs';

export function buildThreeDeviceJourneyManifest({ baselineInspection, candidate, cReset }) {
  const identity = baselineInspection?.identity;
  const android = baselineInspection?.android;
  const inspection = android?.inspection;
  if (!identity?.groupId || !identity.timelineId) {
    throw new Error('T121 restarted A+B identity evidence is incomplete.');
  }
  if (android?.integrity !== 'ok' || inspection?.syncGroupId !== identity.groupId
      || inspection.syncGroupTimelineId !== identity.timelineId
      || inspection.activeSyncGroupMemberCount !== 2) {
    throw new Error('T121 restarted Android B facts do not match A.');
  }
  const empty = cReset?.emptyFacts;
  if (empty?.integrity !== 'ok' || empty.localGroupId !== null || empty.userNodeCount !== 0) {
    throw new Error('T121 Windows C empty product state is incomplete.');
  }
  const expected = { groupId: identity.groupId, timelineId: identity.timelineId };
  const baseline = { devices: {
    A: { activeMemberCount: 2, device: 'A', groupId: expected.groupId,
      localMemberState: 'active', timelineId: expected.timelineId },
    B: { activeMemberCount: 2, device: 'B', groupId: expected.groupId,
      localMemberState: 'active', timelineId: expected.timelineId },
    C: { activeMemberCount: 0, attachmentCount: empty.attachmentCount,
      contentBlobCount: empty.contentBlobCount, device: 'C', groupId: null,
      localMemberState: null, timelineId: null, userNodeCount: empty.userNodeCount }
  }, groupId: expected.groupId, timelineId: expected.timelineId };
  return createAcceptanceManifest({ baseline, candidate, phase: 'journey' });
}
