import { expect, it } from 'vitest';

import { resolveCompanionPairingMetadata } from './companionPairingMetadata.js';

it('projects non-secret paired metadata from active remote Sync Group members', () => {
  expect(resolveCompanionPairingMetadata({
    created_at: '2026-08-08T00:00:00.000Z',
    created_by_host_name: 'Studio',
    display_name: 'Studio',
    group_id: 'group-1',
    local_host_name: 'Studio',
    local_member_state: 'active',
    members: [
      { approved_by_host_name: 'Studio', authorization_id: 'local-1', host_name: 'Studio',
        host_platform: 'darwin', joined_at: '2026-08-08T00:00:00.000Z', state: 'active' },
      { approved_by_host_name: 'Studio', authorization_id: 'remote-1', host_name: 'Reading Phone',
        host_platform: 'android-capacitor', joined_at: '2026-08-08T00:01:00.000Z', state: 'active' }
    ],
    timeline_id: 'timeline-1'
  })).toEqual({
    paired_authorization_count: 1,
    paired_authorizations: [{
      authorization_id: 'remote-1', client_address: null, host_name: 'Reading Phone',
      host_platform: 'android-capacitor', paired_at: '2026-08-08T00:01:00.000Z'
    }]
  });
});
