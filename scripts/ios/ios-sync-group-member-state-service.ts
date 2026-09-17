import {
  IOS_HOSTED_PROVIDER_DEVICE_ID,
  IOS_HOSTED_SYNC_GROUP_ID
} from '../../lib/platform/iosHostedSyncGroupContract.ts';
import { parseSyncGroupMemberState } from '../../lib/platform/syncGroupMemberStateContract.ts';

type RoutedResponse = { body: string; contentType: 'application/json' } | null;

export function routeIosHostedMemberStateRequest(request: {
  bodyText: string;
  method: string;
  url: string;
}): RoutedResponse {
  if (request.method !== 'POST' || request.url !== '/sync-group/member-state') return null;
  const incoming = parseSyncGroupMemberState(JSON.parse(request.bodyText));
  if (incoming.group_id !== IOS_HOSTED_SYNC_GROUP_ID ||
      !incoming.devices.some((device) => device.device_identity_key === IOS_HOSTED_PROVIDER_DEVICE_ID)) {
    throw new Error('ios_hosted_member_state_identity_mismatch');
  }
  return {
    body: JSON.stringify({
      ...incoming,
      sender_device_identity_key: IOS_HOSTED_PROVIDER_DEVICE_ID
    }),
    contentType: 'application/json'
  };
}
