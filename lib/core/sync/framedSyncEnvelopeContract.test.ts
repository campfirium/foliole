import { describe, expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION, type PublishedTransfer } from './framedSyncContract.js';
import { assertSessionEnvelopeBinding, assertTransferEnvelopeBinding } from './framedSyncEnvelopeContract.js';
import type { FramedSyncPreamble } from './framedSyncFraming.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { frameTypeForPayload, type ProtocolPayloadCase } from './framedSyncReceiver.js';
import { deriveSessionContextId, type FramedSyncSessionContext } from './framedSyncSession.js';

const bytes = (value: number, size = 32) => new Uint8Array(size).fill(value);
const context: PublishedTransfer['context'] = {
  groupId: 'group-a', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  receiverDeviceId: 'device-b', receiverLibraryEpoch: 'epoch-b',
  senderDeviceId: 'device-a', senderLibraryEpoch: 'epoch-a'
};
const published: PublishedTransfer = {
  blobCount: 2n, contentId: bytes(2), context, factCount: 3n,
  manifestHash: bytes(3), totalBlobBytes: 42n, transferId: bytes(1)
};
const transferAttemptId = bytes(4, 16);
const preamble: FramedSyncPreamble = {
  attemptId: transferAttemptId, compression: 'none', contextId: published.transferId,
  contextKind: 'transfer', noncePrefix: bytes(5, 4), startingSequence: 0n
};

function message(payloadCase: ProtocolPayloadCase, payload: unknown) {
  return decodeAndValidateProtocolMessage(
    encodeValidatedProtocolMessage(payloadCase, payload), frameTypeForPayload(payloadCase)
  );
}

function header(transferId = published.transferId, attemptId = transferAttemptId) {
  const blobs = [
    { byteLength: 20, required: true, role: 1, sha256: bytes(8) },
    { byteLength: 22, required: false, role: 4, sha256: bytes(9) }
  ];
  const facts = [1, 2, 3].map((index) => ({
    identity: { factId: `fact-${index}`, globalId: `node-${index}`, kind: 2, objectType: 'node' },
    requiredBlobHashes: index === 1 ? [bytes(8)] : [], sharedStateHash: bytes(index)
  }));
  return message('transfer_header', {
    attemptId, manifest: {
      blobs, contentId: published.contentId, facts, groupId: 'group-a', protocolVersion: 22
    }, transferId
  });
}

function sessionPreamble(sessionId: Uint8Array, contextId: Uint8Array): FramedSyncPreamble {
  return {
    compression: 'none', contextId, contextKind: 'session', noncePrefix: bytes(7, 4),
    sessionId, startingSequence: 0n
  };
}

describe('framed sync validated transfer envelope binding', () => {
  it('binds transfer identity, attempt, hashes and authenticated author', () => {
    expect(() => assertTransferEnvelopeBinding(
      published, preamble, header(bytes(9)), 'device-a'
    )).toThrow('transfer_payload_identity_mismatch');
    expect(() => assertTransferEnvelopeBinding(
      published, preamble, header(published.transferId, bytes(9, 16)), 'device-a'
    )).toThrow('transfer_attempt_identity_mismatch');
    const trailer = message('transfer_trailer', {
      blobCount: 2, factCount: 3, manifestHash: bytes(9), transferId: published.transferId
    });
    expect(() => assertTransferEnvelopeBinding(
      published, preamble, trailer, 'device-a'
    )).toThrow('transfer_manifest_hash_mismatch');
    expect(() => assertTransferEnvelopeBinding(
      published, preamble, header(), 'device-b'
    )).toThrow('transfer_message_author_mismatch');
  });

  it('requires receiver-authored receipts', () => {
    const receipt = message('transfer_receipt', {
      appliedStateHash: bytes(8), contentId: published.contentId,
      receiverDeviceId: 'device-b', receiverLibraryEpoch: 'epoch-b',
      transferId: published.transferId
    });
    expect(() => assertTransferEnvelopeBinding(
      published, preamble, receipt, 'device-b'
    )).not.toThrow();
    expect(() => assertTransferEnvelopeBinding(
      published, preamble, receipt, 'device-a'
    )).toThrow('transfer_message_author_mismatch');
  });
});

describe('framed sync validated session envelope binding', () => {
  const http: Omit<FramedSyncSessionContext, 'sessionId'> = {
    groupId: 'group-a', initiatorDeviceId: 'device-a', initiatorLibraryEpoch: 'epoch-a',
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    responderDeviceId: 'device-b', responderLibraryEpoch: 'epoch-b'
  };

  it('binds handshake and proposal to authenticated endpoint roles', async () => {
    const sessionId = bytes(6, 16);
    const wire = sessionPreamble(sessionId, await deriveSessionContextId({ ...http, sessionId }));
    const handshake = message('handshake', {
      capabilities: [], deviceId: 'device-a', groupId: 'group-a',
      libraryEpoch: 'epoch-a', protocolVersion: 22, sessionId
    });
    await expect(assertSessionEnvelopeBinding(http, wire, handshake, 'device-a'))
      .resolves.toMatchObject(http);
    const proposal = message('transfer_proposal', {
      blobCount: 2, contentId: published.contentId, factCount: 3,
      receiverDeviceId: 'device-b', receiverLibraryEpoch: 'epoch-b',
      senderDeviceId: 'device-a', senderLibraryEpoch: 'epoch-a', totalBlobBytes: 42,
      transferId: published.transferId
    });
    await expect(assertSessionEnvelopeBinding(http, wire, proposal, 'device-b', published))
      .rejects.toThrow('session_message_author_mismatch');
    await expect(assertSessionEnvelopeBinding(http, wire, proposal, 'device-a', published))
      .resolves.toMatchObject(http);
  });

  it('requires a durable sender request before receiver termination acknowledgement', async () => {
    const sessionId = bytes(6, 16);
    const wire = sessionPreamble(sessionId, await deriveSessionContextId({ ...http, sessionId }));
    const request = message('transfer_termination', {
      acknowledged: false, memberId: 'device-b', transferId: published.transferId
    });
    const acknowledgement = message('transfer_termination', {
      acknowledged: true, memberId: 'device-b', transferId: published.transferId
    });
    await expect(assertSessionEnvelopeBinding(http, wire, request, 'device-a', published))
      .resolves.toMatchObject(http);
    await expect(assertSessionEnvelopeBinding(http, wire, acknowledgement, 'device-b', published))
      .rejects.toThrow('termination_request_not_durable');
    await expect(assertSessionEnvelopeBinding(
      http, wire, acknowledgement, 'device-b', published, true
    )).resolves.toMatchObject(http);
  });
});
