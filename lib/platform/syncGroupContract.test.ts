import { expect, it } from 'vitest';

import { resolveSyncGroupDisplayHostName } from './syncGroupContract.js';

it('derives the Sync Group label from its creator Host', () => {
  expect(resolveSyncGroupDisplayHostName({
    created_at: '2026-08-08T00:00:00Z', created_by_host_name: 'desktop-a', display_name: 'Legacy name',
    group_id: 'group-a', local_host_name: 'desktop-a', local_member_state: 'active', members: [{
      approved_by_host_name: 'desktop-a', authorization_id: 'founder-a', host_name: 'desktop-a',
      host_platform: 'darwin', joined_at: '2026-08-08T00:00:00Z', state: 'active'
    }], timeline_id: 'timeline-a'
  })).toBe('desktop-a');
});
