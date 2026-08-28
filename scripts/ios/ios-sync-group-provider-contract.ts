import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import { verifyCompanionRequestSignature } from '../../electron/sync/companionRequestSignature.ts';
import { DesktopSyncGroupJoinProvider } from '../../electron/sync/syncGroupJoinProvider.ts';
import {
  IOS_HOSTED_PROVIDER_DEVICE_ID,
  IOS_HOSTED_PROVIDER_NAME,
  IOS_HOSTED_SYNC_GROUP_ID
} from '../../lib/platform/iosHostedSyncGroupContract.ts';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.ts';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.ts';

import type { createIosSyncGroupProviderObservations } from './ios-sync-group-provider-observations.ts';

const GROUP_NAME = 'Acceptance Sync Group';
type Observations = ReturnType<typeof createIosSyncGroupProviderObservations>;

export function createIosSyncGroupProviderContract(observations: Observations) {
  const workgroupKey = randomBytes(32).toString('base64url');
  const runtimeInstanceId = randomUUID();
  const groupTag = createHash('sha256').update(Buffer.from(workgroupKey, 'base64url')).digest('hex').slice(0, 32);
  let acceptedDeviceId: string | null = null;
  const provider = new DesktopSyncGroupJoinProvider({
    display_name: GROUP_NAME, group_id: IOS_HOSTED_SYNC_GROUP_ID, workgroup_key: workgroupKey
  }, (device) => {
    acceptedDeviceId = createSyncGroupDeviceIdentity({
      device_anchor: device.device_anchor, group_id: IOS_HOSTED_SYNC_GROUP_ID,
      library_path: device.canonical_library_path, path_flavor: device.path_flavor
    }).identity_key;
  });

  return {
    async accept(input: unknown) {
      const serialized = JSON.stringify(input);
      observations.group_key_absent_before_accept =
        !serialized.includes(workgroupKey) && !/group_key|workgroup_key/u.test(serialized);
      const request = provider.receive(input as Parameters<typeof provider.receive>[0]);
      observations.request_statuses.push('requested');
      observations.acceptance_request_id = request.request_id;
      await provider.accept(request.request_id);
      observations.request_statuses.push('accepted');
      observations.acceptance_explicit = true;
      observations.accepted_device_id = acceptedDeviceId;
      return request;
    },
    collect(requestId: string) {
      const acceptance = provider.collect(requestId);
      if (acceptance) {
        observations.acceptance_collected_count += 1;
        observations.request_statuses.push('collected');
      }
      return acceptance;
    },
    discovery: {
      app_version: '0.7.9', group_display_name: GROUP_NAME, group_id: IOS_HOSTED_SYNC_GROUP_ID,
      group_tag: groupTag, protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
      provider_device_id: IOS_HOSTED_PROVIDER_DEVICE_ID, provider_device_name: IOS_HOSTED_PROVIDER_NAME,
      provider_platform: 'macOS', runtime_instance_id: runtimeInstanceId
    },
    authenticate(request: IncomingMessage, bodyText = '') {
      const value = (name: string) => typeof request.headers[name] === 'string' ? request.headers[name] : '';
      const valid = acceptedDeviceId !== null && value('x-device-id') === acceptedDeviceId &&
        value('x-sync-group-id') === IOS_HOSTED_SYNC_GROUP_ID && verifyCompanionRequestSignature({
          bodyText, method: request.method ?? 'GET', nonce: value('x-nonce'),
          pathWithQuery: request.url ?? '/', secret: workgroupKey,
          signature: value('x-signature'), timestamp: value('x-timestamp')
        });
      observations.signature_headers_valid ||= valid;
      if (valid) observations.signed_request_count += 1;
      return valid;
    }
  };
}
