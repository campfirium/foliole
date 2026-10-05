import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import protobuf from 'protobufjs';
import { describe, expect, it } from 'vitest';

import { deriveSessionFrameKey, deriveTransferFrameKey, decryptFrame } from './framedSyncCrypto.js';
import { decodeFrameHeader } from './framedSyncFraming.js';
import { decodeAndValidateProtocolMessage } from './framedSyncProtocolCodec.js';
import {
  frameTypeForPayload,
  receiveFramedSyncFrame,
  type ProtocolPayloadCase
} from './framedSyncReceiver.js';
import { deriveSessionContextId } from './framedSyncSession.js';

type CryptoVector = Readonly<{
  aad_hex: string;
  ciphertext_hex: string;
  key_hex: string;
  nonce_hex: string;
  plaintext_hex: string;
  frame_header_hex: string;
  preamble_hex: string;
}>;

type Corpus = Readonly<{
  blob_contract: Readonly<{
    byte_length: number;
    chunks: readonly Readonly<{ byte_length: number; offset: number; sha256_hex: string }>[];
    sha256_hex: string;
  }>;
  crypto: Readonly<{
    session: CryptoVector & Readonly<{ context_id_hex: string; session_id_hex: string }>;
    transfer: CryptoVector & Readonly<{ attempt_id_hex: string; group_key_hex: string; transfer_id_hex: string }>;
  }>;
  malformed: readonly Readonly<{ hex: string; name: string }>[];
  messages: readonly Readonly<{ base64: string; name: string; payload_case: ProtocolPayloadCase }>[];
}>;

type MaliciousCorpus = Readonly<{
  accepted_messages: readonly CorpusMessage[];
  corpus_version: number;
  messages: readonly (CorpusMessage & Readonly<{
    expected_error: string;
  }>)[];
  protocol_version: number;
}>;

type CorpusMessage = Readonly<{
  base64: string;
  byte_length: number;
  frame_type: number;
  name: string;
  payload_case: ProtocolPayloadCase;
}>;

const fromHex = (value: string) => Uint8Array.from(Buffer.from(value, 'hex'));
const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');

async function corpus() {
  return JSON.parse(await readFile(
    path.resolve('lib/core/sync/fixtures/framed-sync-v22-golden.json'), 'utf8'
  )) as Corpus;
}

async function maliciousCorpus() {
  return JSON.parse(await readFile(
    path.resolve('lib/core/sync/fixtures/framed-sync-v22-malicious.json'), 'utf8'
  )) as MaliciousCorpus;
}

describe('framed sync v22 golden corpus', () => {
  it('decodes and re-encodes every protobuf message byte-for-byte', async () => {
    const root = await protobuf.load(path.resolve(
      'lib/core/sync/proto/foliole/sync/v22/framed_sync.proto'
    ));
    const protocolMessage = root.lookupType('foliole.sync.v22.ProtocolMessage');
    for (const message of (await corpus()).messages) {
      const encoded = Uint8Array.from(Buffer.from(message.base64, 'base64'));
      expect([...protocolMessage.encode(protocolMessage.decode(encoded)).finish()], message.name)
        .toEqual([...encoded]);
      expect(decodeAndValidateProtocolMessage(
        encoded, frameTypeForPayload(message.payload_case)
      ).payloadCase).toBe(message.payload_case);
    }
  });

  it('rejects every malformed frame header before reading a body', async () => {
    for (const malformed of (await corpus()).malformed) {
      expect(() => decodeFrameHeader(fromHex(malformed.hex)), malformed.name).toThrow();
    }
  });

  it('rejects every language-neutral malicious protobuf message', async () => {
    const malicious = await maliciousCorpus();
    expect(malicious).toMatchObject({ corpus_version: 1, protocol_version: 22 });
    expect(malicious.messages.map(({ name }) => name)).toEqual([
      'unspecified-fact-kind', 'empty-fact-id', 'short-shared-state-hash',
      'long-shared-state-hash', 'unknown-blob-role', 'duplicate-canonical-field',
      'false-null-marker', 'duplicate-capability-name', 'capability-count-over-limit',
      'canonical-depth-over-limit', 'uint64-addition-overflow',
      'fact-authenticated-as-transfer-header'
    ]);
    for (const message of malicious.messages) {
      const encoded = Uint8Array.from(Buffer.from(message.base64, 'base64'));
      expect(encoded.byteLength, message.name).toBe(message.byte_length);
      expect(() => decodeAndValidateProtocolMessage(
        encoded, message.frame_type
      ), message.name).toThrow(message.expected_error);
    }
  });

  it('accepts every frozen language-neutral exact boundary', async () => {
    const accepted = (await maliciousCorpus()).accepted_messages;
    expect(accepted.map(({ name }) => name)).toEqual([
      'canonical-depth-exact', 'capability-count-exact', 'uint64-max-exact'
    ]);
    for (const message of accepted) {
      const encoded = Uint8Array.from(Buffer.from(message.base64, 'base64'));
      expect(encoded.byteLength, message.name).toBe(message.byte_length);
      expect(decodeAndValidateProtocolMessage(
        encoded, message.frame_type
      ).payloadCase, message.name).toBe(message.payload_case);
    }
  });
});

describe('framed sync v22 golden crypto and blob vectors', () => {
  it('decrypts the frozen session and transfer frames', async () => {
    const vectors = (await corpus()).crypto;
    const sessionId = fromHex(vectors.session.session_id_hex);
    const sessionContextId = await deriveSessionContextId({
      groupId: 'group-a', initiatorDeviceId: 'device-a', initiatorLibraryEpoch: 'epoch-a',
      protocolVersion: 22, responderDeviceId: 'device-b', responderLibraryEpoch: 'epoch-b', sessionId
    });
    const sessionKey = await deriveSessionFrameKey({
      groupKey: fromHex(vectors.transfer.group_key_hex), sessionContextId, sessionId
    });
    expect(hex(sessionContextId)).toBe(vectors.session.context_id_hex);
    expect(hex(sessionKey)).toBe(vectors.session.key_hex);
    const transferKey = await deriveTransferFrameKey({
      attemptId: fromHex(vectors.transfer.attempt_id_hex),
      groupKey: fromHex(vectors.transfer.group_key_hex),
      transferId: fromHex(vectors.transfer.transfer_id_hex)
    });
    expect(hex(transferKey)).toBe(vectors.transfer.key_hex);
    for (const vector of [vectors.session, vectors.transfer]) {
      const plaintext = await decryptFrame({
        aad: fromHex(vector.aad_hex), ciphertext: fromHex(vector.ciphertext_hex),
        key: fromHex(vector.key_hex), nonce: fromHex(vector.nonce_hex)
      });
      expect(hex(plaintext)).toBe(vector.plaintext_hex);
      const received = await receiveFramedSyncFrame({
        ciphertext: fromHex(vector.ciphertext_hex), frameHeader: fromHex(vector.frame_header_hex),
        key: fromHex(vector.key_hex), preamble: fromHex(vector.preamble_hex)
      });
      expect(hex(received.plaintext)).toBe(vector.plaintext_hex);
    }
  });

  it('reconstructs the deterministic 512 KiB plus one blob vector', async () => {
    const vector = (await corpus()).blob_contract;
    const bytes = Uint8Array.from({ length: vector.byte_length }, (_, index) => index % 251);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(vector.sha256_hex);
    expect(vector.chunks).toHaveLength(2);
    for (const chunk of vector.chunks) {
      const value = bytes.subarray(chunk.offset, chunk.offset + chunk.byte_length);
      expect(createHash('sha256').update(value).digest('hex')).toBe(chunk.sha256_hex);
    }
  });
});
