import { afterEach, describe, expect, it } from 'vitest';

import {
  clearCompanionPairRequests,
  createCompanionPairRequest,
  loadPendingCompanionPairRequests
} from './companionPairingRequests.js';

const TEST_PAIRING_PUBLIC_KEY = Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString('base64url');

describe('companion pairing requests', () => {
  afterEach(() => {
    clearCompanionPairRequests();
  });

  it('keeps the client address for desktop pairing review', () => {
    createCompanionPairRequest({
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

  it('rate limits new pairing requests by client address', () => {
    const nowMs = Date.parse('2026-04-24T10:00:00.000Z');
    for (let index = 0; index < 5; index += 1) {
      expect(createCompanionPairRequest({
        clientAddress: '192.168.1.22',
        deviceId: `android-${index}`,
        deviceKind: 'android-capacitor',
        deviceName: `Android companion ${index}`,
        nowMs: nowMs + index,
        pairingPublicKey: TEST_PAIRING_PUBLIC_KEY
      })).toMatchObject({ created: true, rate_limited: false });
    }

    expect(createCompanionPairRequest({
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
