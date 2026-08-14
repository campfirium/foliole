import path from 'node:path';

import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';

import { closeWindowsSyncGroupSession } from './windows-sync-group-session-close.mjs';

export function assertOwnedClientCompleteFacts(facts) {
  if (facts.activeMemberCount < 2 || facts.nodeCount === 0 || facts.contentBlobCount === 0
      || facts.missingAttachmentCount !== 0 || facts.missingContentBlobCount !== 0) {
    throw new Error(`Windows C did not complete ordinary sync: ${JSON.stringify(facts)}`);
  }
}

export function assertOwnedClientEmptyFacts(facts) {
  if (facts.integrity !== 'ok' || facts.localGroupId !== null || facts.localTimelineId !== null
      || facts.localMemberState !== null || facts.activeMemberCount !== 0 || facts.userNodeCount !== 0
      || facts.contentBlobCount !== 0 || facts.attachmentCount !== 0) {
    throw new Error(`Windows C did not start empty: ${JSON.stringify(facts)}`);
  }
}

export function assertOwnedClientSeedFacts(facts, material) {
  const attachmentReady = facts.cachedAttachmentIds?.includes(material.attachmentId)
    && facts.attachmentIds?.includes(material.attachmentId);
  if (facts.integrity !== 'ok' || facts.localGroupId !== null
      || facts.localTimelineId !== null || facts.localMemberState !== null
      || facts.activeMemberCount !== 0 || facts.userNodeCount !== 1
      || facts.contentBlobCount !== 1 || facts.attachmentCount !== 1
      || facts.facts?.[material.factId] !== true || !attachmentReady
      || facts.missingAttachmentCount !== 0 || facts.missingContentBlobCount !== 0) {
    throw new Error(`Windows C pre-join material is incomplete: ${JSON.stringify(facts)}`);
  }
}

export async function seedOwnedWindowsClient({ evidenceRoot, inspect, invoke, openSession }) {
  const session = await openSession();
  let material;
  try {
    material = await createDesktopSyncGroupJourneyFact({
      device: 'C', evidenceRoot: path.join(evidenceRoot, 'c-pre-join-fact'),
      session: { invoke: (command, args) => invoke(session.page, command, args) },
      withAttachment: true
    });
  } finally {
    await closeWindowsSyncGroupSession(session);
  }
  const facts = await inspect([material.factId]);
  assertOwnedClientSeedFacts(facts, material);
  return { facts, material };
}
