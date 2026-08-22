import { expect, it } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../../../lib/platform/syncProtocolContract';

import { projectCompanionSyncGroupPairingState } from './companionSyncGroupPairingState';

it('preserves an old remote protocol profile when projecting Sync Group identity', () => {
  const oldProtocol = {
    ...CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    max_supported_version: 2,
    min_supported_version: 2,
    version: 2
  };
  const result = projectCompanionSyncGroupPairingState({
    local_host_name: 'A5',
    members: [
      { authorization_id: 'a5-auth', host_name: 'A5', host_platform: 'android', joined_at: 'now' },
      { authorization_id: 'mac-auth', host_name: 'Mac', host_platform: 'darwin', joined_at: 'now' }
    ]
  } as never, {
    is_paired: true,
    negotiated_protocol_version: 2,
    remote_protocol: oldProtocol
  } as never);

  expect(result).toMatchObject({
    negotiated_protocol_version: 2,
    protocol_compatibility: { reason: 'protocol_version_unsupported', status: 'incompatible' },
    remote_protocol: oldProtocol,
    repair_required: true,
    sync_usable: false
  });
});
