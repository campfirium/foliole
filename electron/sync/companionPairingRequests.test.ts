import { afterEach, describe, expect, it } from 'vitest';

import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  evaluateSyncProtocolCompatibility
} from '../../lib/platform/syncProtocolContract.js';

import {
  approveCompanionPairRequest,
  clearCompanionPairRequests,
  createCompanionPairRequest,
  loadCompanionPairRequestForCompletion,
  loadPendingCompanionPairRequests
} from './companionPairingRequests.js';

const TEST_PAIRING_PUBLIC_KEY = Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString('base64url');
const protocolArgs = {
  compatibility: evaluateSyncProtocolCompatibility(CURRENT_SYNC_PROTOCOL_DESCRIPTOR),
  hostName: 'A5',
  hostPlatform: 'android-capacitor',
  protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
};

afterEach(() => {
  clearCompanionPairRequests();
});

describe('companion pairing request lifecycle', () => {
  it('keeps the client address for desktop pairing review', () => {
    createCompanionPairRequest({
      ...protocolArgs,
      clientAddress: '192.168.1.22',
      deviceId: 'android-1',
      deviceKind: 'android-capacitor',
      deviceName: 'Android companion android-1',
      nowMs: Date.parse('2026-04-24T10:00:00.000Z'),
      pairingPublicKey: TEST_PAIRING_PUBLIC_KEY
    });

    expect(loadPendingCompanionPairRequests(Date.parse('2026-04-24T10:00:01.000Z'))).toMatchObject([
      {
        client_address: '192.168.1.22',
        device_id: 'android-1',
        device_kind: 'android-capacitor'
      }
    ]);
  });

  it('expires pending pair requests after the approval window', () => {
    const nowMs = Date.parse('2026-04-24T10:00:00.000Z');
    createCompanionPairRequest({
      ...protocolArgs,
      clientAddress: '192.168.1.22',
      deviceId: 'android-1',
      deviceKind: 'android-capacitor',
      deviceName: 'Android companion android-1',
      nowMs,
      pairingPublicKey: TEST_PAIRING_PUBLIC_KEY
    });

    expect(loadPendingCompanionPairRequests(nowMs + 119_000)).toHaveLength(1);
    expect(loadPendingCompanionPairRequests(nowMs + 120_001)).toHaveLength(0);
  });

  it('starts a fresh completion window when a request is approved', () => {
    const nowMs = Date.parse('2026-04-24T10:00:00.000Z');
    const created = createCompanionPairRequest({
      ...protocolArgs,
      clientAddress: '192.168.1.22',
      deviceId: 'android-1',
      deviceKind: 'android-capacitor',
      deviceName: 'Android companion android-1',
      nowMs,
      pairingPublicKey: TEST_PAIRING_PUBLIC_KEY
    });
    if (created.rate_limited) throw new Error('unexpected_pair_request_rate_limit');

    approveCompanionPairRequest(created.request.pair_request_id, nowMs + 119_000);

    expect(loadCompanionPairRequestForCompletion(created.request.pair_request_id, nowMs + 121_000))
      .toMatchObject({ request: { status: 'approved' } });
  });
});

it('binds an ordinary approval to the selected assigned member name', () => {
  const nowMs = Date.parse('2026-04-24T10:00:00.000Z');
  const created = createCompanionPairRequest({
    ...protocolArgs, deviceId: 'A5', deviceKind: 'android-capacitor', deviceName: 'A5',
    nowMs, pairingPublicKey: TEST_PAIRING_PUBLIC_KEY
  });
  if (created.rate_limited) throw new Error('unexpected_pair_request_rate_limit');
  approveCompanionPairRequest(
    created.request.pair_request_id, nowMs + 1, 'recover_existing_member', 'A5 2'
  );
  expect(loadCompanionPairRequestForCompletion(created.request.pair_request_id, nowMs + 2))
    .toMatchObject({ request: {
      device_id: 'A5', host_name: 'A5 2', membership_action: 'recover_existing_member', status: 'approved'
    } });
});

describe('companion pairing request rate limiting', () => {
  it('rate limits new pairing requests by client address', () => {
    const nowMs = Date.parse('2026-04-24T10:00:00.000Z');
    for (let index = 0; index < 5; index += 1) {
      expect(createCompanionPairRequest({
        ...protocolArgs,
        clientAddress: '192.168.1.22',
        deviceId: `android-${index}`,
        deviceKind: 'android-capacitor',
        deviceName: `Android companion ${index}`,
        nowMs: nowMs + index,
        pairingPublicKey: TEST_PAIRING_PUBLIC_KEY
      })).toMatchObject({ created: true, rate_limited: false });
    }

    expect(createCompanionPairRequest({
      ...protocolArgs,
      clientAddress: '192.168.1.22',
      deviceId: 'android-6',
      deviceKind: 'android-capacitor',
      deviceName: 'Android companion 6',
      nowMs: nowMs + 5,
      pairingPublicKey: TEST_PAIRING_PUBLIC_KEY
    })).toMatchObject({
      created: false,
      rate_limited: true
    });
  });
});
