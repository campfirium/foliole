import { expect, it } from 'vitest';

import { resolveSyncGroupDisplayDeviceName } from './syncGroupContract.js';

it('derives the Sync Group label from its creator Device', () => {
  expect(resolveSyncGroupDisplayDeviceName({
    created_at: '2026-08-08T00:00:00Z', created_by_device_id: 'desktop-a', display_name: 'Legacy name',
    group_id: 'group-a', local_device_id: 'desktop-a', local_member_state: 'active', members: [{
      approved_by_device_id: 'desktop-a', authorization_id: 'founder-a', device_id: 'desktop-a',
      device_kind: 'darwin', device_name: 'Maci', joined_at: '2026-08-08T00:00:00Z', state: 'active'
    }], timeline_id: 'timeline-a'
  })).toBe('Maci');
});
