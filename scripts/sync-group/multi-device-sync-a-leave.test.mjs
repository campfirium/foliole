// @vitest-environment node

import { expect, it } from 'vitest';

import {
  assertAndroidConsumerComplete, assertSurvivorProof, projectAndroidConsumerProgress
} from './multi-device-sync-a-leave-proof.mjs';

const factIds = { B: 'fact-b', C: 'fact-c' };
const facts = { 'fact-b': true, 'fact-c': true };
const android = { database: { counts: { attachments: 2, content_blobs: 6 }, integrity: 'ok',
  inspection: { activeMemberHosts: ['Android B', 'Windows C'], activeSyncGroupMemberCount: 2,
    departedMemberHosts: ['Mac A'], journeyFacts: { 'fact-b': 'B', 'fact-c': 'C' },
    syncGroupId: 'group-1',
    syncGroupTimelineId: 'timeline-1', missingAttachmentCount: 0,
    missingContentBlobCount: 0, userNodeCount: 6 } } };
const restarted = { activeHosts: { desktop: ['Windows C'], mobile: ['Android B'] },
  activeMemberCount: 2, attachmentCount: 2, contentBlobCount: 6, facts,
  localGroupId: 'group-1', localMemberState: 'active', localTimelineId: 'timeline-1',
  userNodeCount: 6 };

it('requires exact post-leave facts on survivors and refuses them on the departed host', () => {
  expect(assertSurvivorProof({ android, departed: { facts: {} }, factIds, runId: 'run-1',
    windows: { restarted } })).toHaveLength(2);
});

it('rejects a departed host that accepts a post-leave fact', () => {
  expect(() => assertSurvivorProof({ android, departed: { facts: { 'fact-b': true } },
    factIds, runId: 'run-1', windows: { restarted } }))
    .toThrow('departed participant');
});

it('releases C only after B has the new identities, bodies, and attachment inventory', () => {
  const expected = { formerHostName: 'Mac A', groupId: 'group-1', timelineId: 'timeline-1' };
  const before = { database: { counts: { attachments: 1, content_blobs: 4 }, inspection: {
    ...android.database.inspection, journeyFacts: { old: 'A' }, userNodeCount: 4
  } } };
  expect(assertAndroidConsumerComplete({ before, expected, snapshot: android })).toEqual(factIds);
  expect(projectAndroidConsumerProgress({ before, expected, snapshot: android })).toMatchObject({
    active: 2, activeHosts: 2, departed: true, factIds, group: true,
    inventory: { before: [4, 4, 1], current: [6, 6, 2] }, missing: [0, 0], timeline: true
  });
  expect(() => assertAndroidConsumerComplete({ before, expected, snapshot: {
    ...android, database: { ...android.database, inspection: {
      ...android.database.inspection, journeyFacts: { 'fact-b': 'B' }
    } }
  } })).toThrow('has not consumed');
});
