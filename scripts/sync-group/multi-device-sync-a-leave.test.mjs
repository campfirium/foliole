// @vitest-environment node

import { expect, it } from 'vitest';

import { assertSurvivorProof } from './multi-device-sync-a-leave-proof.mjs';

const factIds = { B: 'fact-b', C: 'fact-c' };
const facts = { 'fact-b': true, 'fact-c': true };
const baseline = { attachmentCount: 1, contentBlobCount: 4, groupId: 'group-1',
  nodeCount: 4, timelineId: 'timeline-1' };
const android = { database: { counts: { attachments: 2, content_blobs: 6 }, integrity: 'ok',
  inspection: { activeMemberIdentities: ['b', 'c'], activeSyncGroupMemberCount: 2,
    departedMemberIdentities: ['a'], journeyFacts: facts, syncGroupId: 'group-1',
    syncGroupTimelineId: 'timeline-1', userNodeCount: 6 } } };
const restarted = { activeDeviceIdentities: { desktop: ['c'], mobile: ['b'] },
  activeMemberCount: 2, attachmentCount: 2, contentBlobCount: 6, facts,
  localGroupId: 'group-1', localMemberState: 'active', localTimelineId: 'timeline-1',
  userNodeCount: 6 };

it('requires B and C to retain one identity, timeline, fact set, and resource inventory', () => {
  expect(assertSurvivorProof({ android, baseline, factIds, formerDeviceIdentity: 'a',
    windows: { proof: { formerDeviceIdentity: 'a' }, restarted } })).toEqual({
    activeMemberIdentities: ['b', 'c'], attachmentCount: 2, contentBlobCount: 6,
    formerAccessState: 'credentials_revoked', groupId: 'group-1',
    nodeCount: 6, timelineId: 'timeline-1'
  });
});

it('rejects a survivor resource inventory that only matches by membership count', () => {
  expect(() => assertSurvivorProof({ android, baseline, factIds, formerDeviceIdentity: 'a',
    windows: { proof: { formerDeviceIdentity: 'a' },
      restarted: { ...restarted, contentBlobCount: 5 } } }))
    .toThrow('complete bidirectional survivor convergence');
});
