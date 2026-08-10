import { createAcceptanceManifest } from './t121-three-device-acceptance-contract.mjs';

function androidProtection(manifest, expectedGroup = undefined) {
  const backup = manifest?.backup;
  const snapshot = manifest?.snapshot;
  const database = snapshot?.database;
  const inspection = database?.inspection;
  const attachmentCount = database?.counts?.attachments ?? 0;
  const attachmentSnapshot = snapshot?.attachments;
  if (backup?.created !== true || backup?.validated !== true || database?.integrity !== 'ok'
      || !inspection?.deviceIdentityFingerprint || !Number.isInteger(database.counts?.nodes)
      || !Number.isInteger(database.counts?.content_blobs) || !Number.isInteger(attachmentCount)
      || (attachmentSnapshot && (!backup.attachmentArchivePath || !attachmentSnapshot.sha256))) {
    throw new Error('T121 Android protection manifest is incomplete.');
  }
  if (expectedGroup && (inspection.syncGroupId !== expectedGroup.groupId
      || inspection.syncGroupTimelineId !== expectedGroup.timelineId
      || inspection.activeSyncGroupMemberCount !== 2)) {
    throw new Error('T121 Android baseline identity does not match A.');
  }
  return { counts: { attachments: attachmentCount, contentBlobs: database.counts.content_blobs,
    nodes: database.counts.nodes }, device: 'B',
  deviceIdentity: inspection.deviceIdentityFingerprint, groupId: inspection.syncGroupId,
  integrity: 'ok', localMemberState: inspection.syncGroupId ? 'active' : null,
  restorable: true, restorePoint: backup.manifestPath,
  timelineId: inspection.syncGroupTimelineId };
}

function assertDesktopProtection(value, device) {
  if (value?.device !== device || value.integrity !== 'ok' || value.restorable !== true) {
    throw new Error(`T121 ${device} desktop protection is incomplete.`);
  }
  return value;
}

export function buildThreeDeviceJourneyManifest({ baselineA, baselineB, baselineInspection,
  candidate, cReset, originalA, originalB }) {
  const identity = baselineInspection?.identity;
  if (!identity?.groupId || !identity.timelineId) {
    throw new Error('T121 restarted A+B identity evidence is incomplete.');
  }
  const expected = { groupId: identity.groupId, timelineId: identity.timelineId };
  const a = assertDesktopProtection(baselineA, 'A');
  const b = androidProtection(baselineB, expected);
  const c = assertDesktopProtection(cReset?.baselineProtection, 'C');
  const baseline = { devices: {
    A: { activeMemberCount: 2, counts: a.counts, device: 'A', groupId: expected.groupId,
      localMemberState: 'active', timelineId: expected.timelineId },
    B: { activeMemberCount: 2, counts: b.counts, device: 'B', groupId: expected.groupId,
      localMemberState: 'active', timelineId: expected.timelineId },
    C: { activeMemberCount: 0, counts: c.counts, device: 'C', groupId: null,
      localMemberState: null, timelineId: null }
  }, groupId: expected.groupId, restorePoints: { A: a, B: b, C: c },
  timelineId: expected.timelineId };
  return createAcceptanceManifest({ baseline, candidate,
    originalProtection: { A: assertDesktopProtection(originalA, 'A'),
      B: androidProtection(originalB), C: assertDesktopProtection(cReset?.originalProtection, 'C') },
    phase: 'journey' });
}
