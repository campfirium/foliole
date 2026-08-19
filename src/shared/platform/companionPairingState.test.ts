import { describe, expect, it } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../lib/platform/syncProtocolContract';

import { normalizePairingState } from './companionPairingState';

const protocol = CURRENT_SYNC_PROTOCOL_DESCRIPTOR;

describe('companionPairingState', () => {
  it('marks old paired credentials without protocol metadata for repair', () => {
    expect(normalizePairingState({
      authorization_id: 'authorization-android-v1',
      device_id: 'android-old',
      is_paired: true,
      paired_at: '2026-07-10T00:00:00.000Z'
    })).toMatchObject({
      is_paired: true,
      repair_required: true,
      sync_usable: false
    });
  });

  it('makes a paired credential usable only with compatible persisted metadata', () => {
    expect(normalizePairingState({
      device_id: 'android-v1',
      is_paired: true,
      negotiated_protocol_version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
      remote_protocol: protocol
    })).toMatchObject({
      protocol_compatibility: { status: 'compatible' },
      repair_required: false,
      sync_usable: true
    });
  });
});
