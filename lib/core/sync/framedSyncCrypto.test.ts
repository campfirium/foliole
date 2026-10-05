import { expect, it } from 'vitest';

import { deriveSessionFrameKey, deriveTransferFrameKey, encryptFrame } from './framedSyncCrypto.js';
import { encodeFrameHeader, encodeFramedSyncPreamble, frameAad, frameNonce } from './framedSyncFraming.js';
import { assertAuthenticatedSessionBootstrap, deriveSessionContextId } from './framedSyncSession.js';

const fromHex = (value: string) => Uint8Array.from(Buffer.from(value, 'hex'));
const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');

it('matches the frozen transfer KDF and AES-GCM vector', async () => {
  const groupKey = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
  const attemptId = fromHex('101112131415161718191a1b1c1d1e1f');
  const transferId = fromHex('202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f');
  const noncePrefix = Uint8Array.from([1, 2, 3, 4]);
  const key = await deriveTransferFrameKey({ attemptId, groupKey, transferId });
  const preamble = encodeFramedSyncPreamble({ attemptId, compression: 'none', contextId: transferId,
    contextKind: 'transfer', noncePrefix, startingSequence: 0n });
  const plaintext = new TextEncoder().encode('frame-vector');
  const header = encodeFrameHeader({ ciphertextBytes: plaintext.byteLength + 16, flags: 0,
    frameType: 2, sequence: 0n });
  const ciphertext = await encryptFrame({ aad: frameAad(preamble, header), key,
    nonce: frameNonce(noncePrefix, 0n), plaintext });
  expect(hex(key)).toBe('3489980c1430c991c600f91b5abc94993951237ce652e3c96c98961a1963106e');
  expect(hex(ciphertext)).toBe('d4111f27f24e9dbc7c26aaa8aeb2678bf2c78ed9a9a755f53c65737c');
});

it('matches the frozen session context and KDF vector', async () => {
  const sessionId = fromHex('00112233445566778899aabbccddeeff');
  const sessionContextId = await deriveSessionContextId({
    groupId: 'group-a', initiatorDeviceId: 'device-a', initiatorLibraryEpoch: 'epoch-a',
    protocolVersion: 22, responderDeviceId: 'device-b', responderLibraryEpoch: 'epoch-b', sessionId
  });
  const key = await deriveSessionFrameKey({
    groupKey: fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'),
    sessionContextId, sessionId
  });
  expect(hex(sessionContextId)).toBe('b91385f313c79240f0d205a2c74a2e23c18773b07a39c6e016c57aef8d000baf');
  expect(hex(key)).toBe('aa2f5ab7291a764391908ec6a01c85dd3c96b70b2dfbb2dad0d708926a2dd140');
  const httpContext = {
    groupId: 'group-a', initiatorDeviceId: 'device-a', initiatorLibraryEpoch: 'epoch-a',
    protocolVersion: 22 as const, responderDeviceId: 'device-b', responderLibraryEpoch: 'epoch-b'
  };
  await expect(assertAuthenticatedSessionBootstrap(httpContext, {
    compression: 'none', contextId: sessionContextId, contextKind: 'session',
    noncePrefix: Uint8Array.from([5, 6, 7, 8]), sessionId, startingSequence: 0n
  })).resolves.toMatchObject({ groupId: 'group-a', sessionId });
});

it('changes ciphertext when authenticated frame metadata changes', async () => {
  const groupKey = new Uint8Array(32);
  const attemptId = new Uint8Array(16);
  const transferId = new Uint8Array(32);
  const key = await deriveTransferFrameKey({ attemptId, groupKey, transferId });
  const preamble = encodeFramedSyncPreamble({ attemptId, compression: 'none', contextId: transferId,
    contextKind: 'transfer', noncePrefix: new Uint8Array(4), startingSequence: 0n });
  const plaintext = Uint8Array.of(1);
  const leftHeader = encodeFrameHeader({ ciphertextBytes: 17, flags: 0, frameType: 2, sequence: 1n });
  const rightHeader = encodeFrameHeader({ ciphertextBytes: 17, flags: 0, frameType: 3, sequence: 1n });
  const nonce = frameNonce(new Uint8Array(4), 1n);
  expect(await encryptFrame({ aad: frameAad(preamble, leftHeader), key, nonce, plaintext }))
    .not.toEqual(await encryptFrame({ aad: frameAad(preamble, rightHeader), key, nonce, plaintext }));
});
