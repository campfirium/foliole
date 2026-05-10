import { describe, expect, it } from 'vitest';

import {
  canRunPrimaryDeviceExternalSource,
  PRIMARY_DEVICE_AUTHORITY_COVERAGE,
  resolvePrimaryDeviceState
} from '../../../lib/core/sync/primaryDeviceResolver.js';

describe('resolvePrimaryDeviceState defaults', () => {
  it('treats an unpaired desktop as its own primary device', () => {
    expect(resolvePrimaryDeviceState({
      hostKind: 'desktop',
      localDeviceId: 'device-desktop'
    })).toEqual({
      canInitiateTakeover: false,
      localRole: 'primary',
      primaryDeviceId: 'device-desktop',
      source: 'self-unpaired',
      takeoverBlockedReasons: []
    });
  });

  it('keeps desktop primary when trusted companion devices exist', () => {
    expect(resolvePrimaryDeviceState({
      hostKind: 'desktop',
      localDeviceId: 'device-desktop',
      trustedPeers: [{ deviceId: 'device-android', status: 'paired' }]
    })).toMatchObject({
      localRole: 'primary',
      primaryDeviceId: 'device-desktop',
      source: 'desktop-paired-default'
    });
  });

  it('treats an unpaired companion as its own primary device', () => {
    expect(resolvePrimaryDeviceState({
      hostKind: 'companion',
      localDeviceId: 'device-android'
    })).toMatchObject({
      localRole: 'primary',
      primaryDeviceId: 'device-android',
      source: 'self-unpaired'
    });
  });

  it('makes a companion secondary when it knows the paired primary device', () => {
    const state = resolvePrimaryDeviceState({
      hostKind: 'companion',
      localDeviceId: 'device-android',
      pairedPrimaryDeviceId: 'device-desktop'
    });

    expect(state).toEqual({
      canInitiateTakeover: false,
      localRole: 'secondary',
      primaryDeviceId: 'device-desktop',
      source: 'companion-paired-primary',
      takeoverBlockedReasons: [
        'sync-latest-confirmation-missing',
        'control-message-carrier-missing',
        'release-ack-missing'
      ]
    });
    expect(canRunPrimaryDeviceExternalSource(state)).toBe(false);
  });
});

describe('resolvePrimaryDeviceState authority gaps', () => {
  it('uses committed primary state when the model later provides one', () => {
    expect(resolvePrimaryDeviceState({
      committedState: { primaryDeviceId: 'device-tablet' },
      hostKind: 'desktop',
      localDeviceId: 'device-desktop',
      trustedPeers: [{ deviceId: 'device-phone', status: 'paired' }]
    })).toMatchObject({
      localRole: 'secondary',
      primaryDeviceId: 'device-tablet',
      source: 'committed-primary-device'
    });
  });

  it('does not promote stale or revoked peers into the current primary device', () => {
    expect(resolvePrimaryDeviceState({
      hostKind: 'companion',
      localDeviceId: 'device-android',
      syncPeers: [
        { deviceId: 'device-desktop-stale', status: 'stale' },
        { deviceId: 'device-desktop-revoked', status: 'revoked' }
      ]
    })).toMatchObject({
      localRole: 'primary',
      primaryDeviceId: 'device-android',
      source: 'self-unpaired'
    });
  });

  it('keeps paired companion secondary but blocks takeover when the primary id is missing', () => {
    expect(resolvePrimaryDeviceState({
      hostKind: 'companion',
      isPairedToPrimary: true,
      localDeviceId: 'device-android'
    })).toEqual({
      canInitiateTakeover: false,
      localRole: 'secondary',
      primaryDeviceId: null,
      source: 'paired-primary-missing',
      takeoverBlockedReasons: [
        'no-current-primary-device',
        'sync-latest-confirmation-missing',
        'control-message-carrier-missing',
        'release-ack-missing'
      ]
    });
  });

  it('keeps the authority coverage matrix tied to existing sync truths', () => {
    expect(PRIMARY_DEVICE_AUTHORITY_COVERAGE.map((item) => item.source)).toEqual([
      'sync_peers',
      'pairing trust',
      'sync_object_state.state_seq',
      'sync_peer_cursors',
      'syncObjectPolicy',
      'sync_push_ack'
    ]);
  });
});
