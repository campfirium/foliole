import { setTimeout as delay } from 'node:timers/promises';

import { createSyncProgressWatchdog } from './sync-progress-watchdog.mjs';

export function productFailure(host, missingFact, message) {
  return Object.assign(new Error(message), {
    failureOwner: 'product', host, missingFact, status: 'stalled'
  });
}

export async function waitUntil(
  label, inspect, accept, missingFact, progress = (value) => value, intervalMs = 1_000
) {
  const deadline = Date.now() + 60_000;
  const observe = createSyncProgressWatchdog({ label, stallMs: 60_000 });
  let value;
  while (Date.now() < deadline) {
    value = await inspect();
    observe(JSON.stringify(progress(value)));
    if (accept(value)) return value;
    await delay(intervalMs);
  }
  throw productFailure('all', missingFact, `${label} did not converge.`);
}

function desktopMemberIdentities(facts) {
  return Object.values(facts.activeDeviceIdentities ?? {}).flat().sort();
}

export function assertThreeDeviceProof({ android, macos, windows, ids, requiredAttachmentId }) {
  const androidFacts = android.database?.inspection;
  const points = [macos, windows];
  const groupIds = [macos.localGroupId, windows.localGroupId, androidFacts?.syncGroupId];
  const timelines = [macos.localTimelineId, windows.localTimelineId, androidFacts?.syncGroupTimelineId];
  const counts = points.map((value) => [value.userNodeCount, value.contentBlobCount,
    value.attachmentCount]);
  counts.push([androidFacts?.userNodeCount, android.database.counts.content_blobs,
    android.database.counts.attachments]);
  const androidHasFacts = Object.values(ids).every((id) => androidFacts?.journeyFacts?.[id]);
  const desktopHasAttachment = !requiredAttachmentId || points.every((value) =>
    value.cachedAttachmentIds?.includes(requiredAttachmentId));
  const androidHasAttachment = !requiredAttachmentId
    || androidFacts?.cachedAttachmentIds?.includes(requiredAttachmentId);
  const memberIdentities = [desktopMemberIdentities(macos), desktopMemberIdentities(windows),
    [...(androidFacts?.activeMemberIdentities ?? [])].sort()];
  if (!groupIds[0] || !timelines[0] || new Set(groupIds).size !== 1 || new Set(timelines).size !== 1
      || points.some((value) => value.activeMemberCount !== 3 || value.localMemberState !== 'active'
        || value.integrity !== 'ok'
        || value.missingAttachmentCount !== 0 || value.missingContentBlobCount !== 0
        || Object.values(ids).some((id) => value.facts?.[id] !== true
          && !value.journeyFacts?.[id]))
      || android.database?.integrity !== 'ok' || androidFacts?.activeSyncGroupMemberCount !== 3
      || !androidHasFacts || !desktopHasAttachment || !androidHasAttachment
      || memberIdentities.some((value) => value.length !== 3)
      || new Set(memberIdentities.map((value) => JSON.stringify(value))).size !== 1
      || androidFacts.missingAttachmentCount !== 0 || androidFacts.missingContentBlobCount !== 0
      || new Set(counts.map((value) => JSON.stringify(value))).size !== 1 || counts[0][2] < 1) {
    throw productFailure('all', 'three_device_restart_convergence_missing',
      'A, B, and C did not preserve one complete three-member timeline.');
  }
  return { attachmentCount: counts[0][2], contentBlobCount: counts[0][1],
    groupId: groupIds[0], nodeCount: counts[0][0], timelineId: timelines[0] };
}

export async function waitForThreeDeviceProof({ ids, inspect, intervalMs = 1_000,
  requiredAttachmentId }) {
  const result = await waitUntil('A, B, and C restarted convergence', async () => {
    const evidence = await inspect();
    try {
      return { evidence, proof: assertThreeDeviceProof({ ...evidence, ids, requiredAttachmentId }) };
    } catch (error) {
      if (error?.missingFact !== 'three_device_restart_convergence_missing') throw error;
      return { evidence, proof: null };
    }
  }, (value) => value.proof !== null, 'three_device_restart_convergence_missing',
  ({ evidence }) => ({
    android: evidence.android.database?.inspection,
    macos: evidence.macos,
    windows: evidence.windows
  }), intervalMs);
  return result.proof;
}
