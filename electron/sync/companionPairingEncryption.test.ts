import { expect, it } from 'vitest';

import { encryptCompanionPairingSecret } from './companionPairingEncryption.js';
import { createTestPairingKeyPair, decryptTestPairingSecret } from './companionPairingProtocolTestSupport.js';

it('encrypts the pairing secret for the companion public key', async () => {
  const clientKeyPair = await createTestPairingKeyPair();

  const encrypted = await encryptCompanionPairingSecret({
    clientPublicKey: clientKeyPair.publicKey,
    credentialSecret: 'paired-credential-secret'
  });

  expect(JSON.stringify(encrypted)).not.toContain('paired-credential-secret');
  await expect(decryptTestPairingSecret({
    encrypted,
    privateKey: clientKeyPair.privateKey
  })).resolves.toBe('paired-credential-secret');
});
