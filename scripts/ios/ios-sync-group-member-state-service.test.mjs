import { describe, expect, it } from 'vitest';

import {
  IOS_HOSTED_PROVIDER_DEVICE_ID,
  IOS_HOSTED_SYNC_GROUP_ID
} from '../../lib/platform/iosHostedSyncGroupContract.ts';
import { SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION } from '../../lib/platform/syncGroupMemberStateContract.ts';

import { routeIosHostedMemberStateRequest } from './ios-sync-group-member-state-service.ts';

const provider = {
  contract_version: 1,
  device_anchor: 'anchor-provider',
  device_identity_key: IOS_HOSTED_PROVIDER_DEVICE_ID,
  canonical_library_path: '/acceptance/provider.db',
  device_name: 'Hosted provider',
  joined_at: '2026-09-17T00:00:00.000Z',
  last_seen_at: null,
  left_at: null,
  platform: 'macOS',
  state: 'active',
  updated_at: '2026-09-17T00:00:00.000Z'
};

describe('iOS hosted member-state service', () => {
  it('answers a member with provider-owned identity before framed transfer', () => {
    const response = routeIosHostedMemberStateRequest({
      bodyText: JSON.stringify({
        contract_version: SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION,
        devices: [provider],
        group_id: IOS_HOSTED_SYNC_GROUP_ID,
        library_epoch: 'hosted-provider-epoch',
        proof_revision: 0,
        removals: [],
        restore: null,
        source_proof_revisions: {},
        sender_device_identity_key: 'ios-member'
      }),
      method: 'POST',
      url: '/sync-group/member-state'
    });

    expect(JSON.parse(response?.body ?? '{}')).toMatchObject({
      contract_version: SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION,
      group_id: IOS_HOSTED_SYNC_GROUP_ID,
      sender_device_identity_key: IOS_HOSTED_PROVIDER_DEVICE_ID
    });
  });

  it('does not intercept unrelated signed requests', () => {
    expect(routeIosHostedMemberStateRequest({ bodyText: '', method: 'POST', url: '/companion/framed-sync' }))
      .toBeNull();
  });
});
