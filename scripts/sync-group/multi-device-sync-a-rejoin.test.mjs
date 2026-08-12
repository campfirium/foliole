// @vitest-environment node

import { expect, it } from 'vitest';

import { assertThreeDeviceProof } from './multi-device-sync-a-rejoin.mjs';

const ids = { A: 'fact-a', B: 'fact-b', C: 'fact-c' };
const identities = { desktop: ['a', 'c'], mobile: ['b'] };
const facts = { activeDeviceIdentities: identities, activeMemberCount: 3, attachmentCount: 1,
  contentBlobCount: 4, facts: { 'fact-a': true, 'fact-b': true, 'fact-c': true },
  integrity: 'ok', localGroupId: 'group-1', localMemberState: 'active',
  localTimelineId: 'timeline-1', missingAttachmentCount: 0, missingContentBlobCount: 0,
  nodeCount: 5 };
const android = { database: { counts: { attachments: 1, content_blobs: 4, nodes: 5 },
  inspection: { activeMemberIdentities: ['a', 'b', 'c'], activeSyncGroupMemberCount: 3,
    journeyFacts: { 'fact-a': 'A', 'fact-b': 'B', 'fact-c': 'C' },
    missingAttachmentCount: 0, missingContentBlobCount: 0, syncGroupId: 'group-1',
    syncGroupTimelineId: 'timeline-1' }, integrity: 'ok' } };

it('requires one restarted identity, timeline, member set, fact set, and resource inventory', () => {
  expect(assertThreeDeviceProof({ android, ids, macos: facts, windows: facts }))
    .toEqual({ attachmentCount: 1, contentBlobCount: 4, groupId: 'group-1',
      nodeCount: 5, timelineId: 'timeline-1' });
});

it('rejects a same-count member set that does not converge by device identity', () => {
  const divergent = { ...facts, activeDeviceIdentities: { desktop: ['a', 'x'], mobile: ['b'] } };
  expect(() => assertThreeDeviceProof({ android, ids, macos: facts, windows: divergent }))
    .toThrow('one complete three-member timeline');
});
