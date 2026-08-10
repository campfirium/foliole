import { expect, it } from 'vitest';

import { isEligibleSyncGroupJoin, parseSyncGroupLibraryFacts } from './companionSyncGroupPairRequest.js';

const emptyFacts = {
  attachment_count: 0, content_blob_count: 0, node_count: 0, review_log_count: 0, timeline_id: null
};

it('requires every joining device to prove an empty library and exact group identity', () => {
  const base = {
    groupId: 'group-1', libraryFacts: emptyFacts,
    requestedGroupId: 'group-1', requestedTimelineId: 'timeline-1', timelineId: 'timeline-1'
  };
  expect(isEligibleSyncGroupJoin(base)).toBe(true);
  expect(isEligibleSyncGroupJoin({
    ...base,
    isExistingActiveMember: true,
    libraryFacts: { ...emptyFacts, node_count: 12 }
  })).toBe(true);
  expect(isEligibleSyncGroupJoin({
    ...base,
    isExistingActiveMember: true,
    requestedTimelineId: 'timeline-other',
    libraryFacts: { ...emptyFacts, node_count: 12 }
  })).toBe(false);
  expect(isEligibleSyncGroupJoin({ ...base, requestedGroupId: 'group-2' })).toBe(false);
  expect(isEligibleSyncGroupJoin({ ...base, libraryFacts: { ...emptyFacts, review_log_count: 1 } })).toBe(false);
  expect(isEligibleSyncGroupJoin({ ...base, libraryFacts: { ...emptyFacts, node_count: 1 } })).toBe(false);
});

it('parses only complete non-negative persistent library facts', () => {
  expect(parseSyncGroupLibraryFacts(emptyFacts)).toEqual(emptyFacts);
  expect(parseSyncGroupLibraryFacts({ ...emptyFacts, attachment_count: -1 })).toBeNull();
  expect(parseSyncGroupLibraryFacts({ ...emptyFacts, node_count: undefined })).toBeNull();
});
