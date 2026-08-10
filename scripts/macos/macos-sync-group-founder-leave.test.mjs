import { expect, it } from 'vitest';

import { assertFounderLeaveOverview } from './macos-sync-group-founder-leave.mjs';

const expected = { groupId: 'group-1', timelineId: 'timeline-1' };
const active = {
  sync_group: {
    group_id: 'group-1', local_member_state: 'active', timeline_id: 'timeline-1'
  }
};

it('requires the exact active group and timeline before founder Leave', () => {
  expect(assertFounderLeaveOverview(active, expected, 'before')).toMatchObject({
    group_id: 'group-1', timeline_id: 'timeline-1'
  });
  expect(() => assertFounderLeaveOverview({
    sync_group: { ...active.sync_group, timeline_id: 'timeline-2' }
  }, expected, 'before')).toThrow('authorized active Sync Group');
});

it('accepts only cleared local membership after founder Leave', () => {
  expect(assertFounderLeaveOverview({ sync_group: null }, expected, 'after')).toBeNull();
  expect(() => assertFounderLeaveOverview(active, expected, 'after'))
    .toThrow('retained Sync Group membership');
});
