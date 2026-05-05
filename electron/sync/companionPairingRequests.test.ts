import { afterEach, describe, expect, it } from 'vitest';

import {
  clearCompanionPairRequests,
  createCompanionPairRequest,
  loadPendingCompanionPairRequests
} from './companionPairingRequests.js';

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
      nowMs: Date.parse('2026-04-24T10:00:00.000Z')
    });

    expect(loadPendingCompanionPairRequests(Date.parse('2026-04-24T10:00:01.000Z'))).toMatchObject([
      {
        client_address: '192.168.1.22',
        device_id: 'android-1',
        device_kind: 'android-capacitor'
      }
    ]);
  });
});
