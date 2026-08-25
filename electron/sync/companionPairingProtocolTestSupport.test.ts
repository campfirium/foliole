import { expect, it } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

import { encryptCompanionPairingSecret } from './companionPairingEncryption.js';
import {
  createTestPairRequestPayload,
  createTestPairingKeyPair,
  decryptTestPairingSecrets
} from './companionPairingProtocolTestSupport.js';

it('builds the current companion pair request contract without legacy device fields', () => {
  const payload = createTestPairRequestPayload({
    group: {
      groupId: 'group-1', groupTag: 'tag-1',
      libraryFacts: {
        attachment_count: 1, content_blob_count: 2, node_count: 3,
        review_log_count: 4, timeline_id: null
      },
      timelineId: 'timeline-1'
    },
    hostName: 'Linux DEB acceptance',
    hostPlatform: 'android-capacitor',
    pairingPublicKey: 'pairing-key'
  });

  expect(payload).toMatchObject({
    group_id: 'group-1', group_tag: 'tag-1', host_name: 'Linux DEB acceptance',
    host_platform: 'android-capacitor', pairing_public_key: 'pairing-key',
    protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR, timeline_id: 'timeline-1'
  });
  expect(payload).not.toHaveProperty('device_id');
  expect(payload).not.toHaveProperty('device_kind');
  expect(payload).not.toHaveProperty('device_name');
});

it('keeps authorization credentials distinct from Sync Group provider secrets', async () => {
  const keyPair = await createTestPairingKeyPair();
  const encryptedCredentialSecret = await encryptCompanionPairingSecret({
    clientPublicKey: keyPair.publicKey, credentialSecret: 'authorization-secret'
  });
  const providerEncryptedCredentialSecret = await encryptCompanionPairingSecret({
    clientPublicKey: keyPair.publicKey, credentialSecret: 'workgroup-secret'
  });

  await expect(decryptTestPairingSecrets({
    encryptedCredentialSecret,
    privateKey: keyPair.privateKey,
    providerEncryptedCredentialSecret
  })).resolves.toEqual({
    credentialSecret: 'authorization-secret',
    providerSecret: 'workgroup-secret'
  });
});
