import { Buffer } from 'node:buffer';
import { createCipheriv, createHash, hkdfSync } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import protobuf from 'protobufjs';

import { maliciousCorpusDocument } from './framed-sync-malicious-corpus.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MALICIOUS_OUTPUT = path.join(ROOT, 'lib/core/sync/fixtures/framed-sync-v22-malicious.json');
const OUTPUT = path.join(ROOT, 'lib/core/sync/fixtures/framed-sync-v22-golden.json');
const SCHEMA_OUTPUT = path.join(ROOT, 'lib/core/sync/generated/framed-sync-v22-schema.json');
const PROTO_PATH = path.join(ROOT, 'lib/core/sync/proto/foliole/sync/v22/framed_sync.proto');
const protobufRoot = await protobuf.load(PROTO_PATH);
const protocolMessage = protobufRoot.lookupType('foliole.sync.v22.ProtocolMessage');
const frameTypeValues = protobufRoot.lookupEnum('foliole.sync.v22.FrameType').values;
const maliciousFrameTypes = Object.freeze({
  blobChunk: frameTypeValues.FRAME_TYPE_BLOB_CHUNK,
  fact: frameTypeValues.FRAME_TYPE_FACT,
  sessionControl: frameTypeValues.FRAME_TYPE_SESSION_CONTROL,
  transferHeader: frameTypeValues.FRAME_TYPE_TRANSFER_HEADER
});

function encodeCase(name, value) {
  const error = protocolMessage.verify(value);
  if (error) throw new Error(`invalid_${name}:${error}`);
  const encoded = protocolMessage.encode(protocolMessage.create(value)).finish();
  const reencoded = protocolMessage.encode(protocolMessage.decode(encoded)).finish();
  if (!Buffer.from(encoded).equals(Buffer.from(reencoded))) throw new Error(`unstable_${name}`);
  const payloadCase = name === 'protocol-error' ? 'error' : name.replaceAll('-', '_');
  return { base64: Buffer.from(encoded).toString('base64'), byte_length: encoded.byteLength, name,
    payload_case: payloadCase };
}

function transferCryptoVector() {
  const groupKey = Uint8Array.from({ length: 32 }, (_, index) => index);
  const attemptId = Uint8Array.from({ length: 16 }, (_, index) => 0x10 + index);
  const transferId = Uint8Array.from({ length: 32 }, (_, index) => 0x20 + index);
  const noncePrefix = Uint8Array.from([1, 2, 3, 4]);
  const sequence = 0n;
  const info = Buffer.concat([Buffer.from('Foliole framed sync v22 transfer'), Buffer.of(0), transferId]);
  const key = Buffer.from(hkdfSync('sha256', groupKey, attemptId, info, 32));
  const preamble = Buffer.alloc(96);
  preamble.write('FOLSYNC2'); preamble.writeUInt16BE(96, 8); preamble.writeUInt16BE(22, 10);
  preamble[12] = 2; preamble[13] = 0; transferId.forEach((byte, index) => { preamble[16 + index] = byte; });
  attemptId.forEach((byte, index) => { preamble[48 + index] = byte; });
  noncePrefix.forEach((byte, index) => { preamble[64 + index] = byte; }); preamble.writeBigUInt64BE(0n, 68);
  const plaintext = Buffer.from('frame-vector');
  const header = Buffer.alloc(16); header.writeUInt32BE(plaintext.length + 16); header.writeBigUInt64BE(sequence, 4);
  header.writeUInt16BE(2, 12);
  const nonce = Buffer.alloc(12); noncePrefix.forEach((byte, index) => { nonce[index] = byte; });
  nonce.writeBigUInt64BE(sequence, 4);
  const cipher = createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(Buffer.concat([preamble, header]));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return {
    aad_hex: Buffer.concat([preamble, header]).toString('hex'), attempt_id_hex: Buffer.from(attemptId).toString('hex'),
    compression: 'none',
    ciphertext_hex: ciphertext.toString('hex'), group_key_hex: Buffer.from(groupKey).toString('hex'),
    frame_header_hex: header.toString('hex'),
    hkdf_info_hex: info.toString('hex'), key_hex: key.toString('hex'), nonce_hex: nonce.toString('hex'),
    plaintext_hex: plaintext.toString('hex'), preamble_hex: preamble.toString('hex'),
    transfer_id_hex: Buffer.from(transferId).toString('hex')
  };
}

function sessionCryptoVector() {
  const groupKey = Uint8Array.from({ length: 32 }, (_, index) => index);
  const sessionId = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const lengthText = (value) => {
    const bytes = Buffer.from(value); const result = Buffer.alloc(4 + bytes.length);
    result.writeUInt32BE(bytes.length); bytes.copy(result, 4); return result;
  };
  const version = Buffer.alloc(2); version.writeUInt16BE(22);
  const contextId = createHash('sha256').update(Buffer.concat([
    Buffer.from('foliole-framed-sync-session-context-v1'), Buffer.of(0), version,
    ...['group-a', 'device-a', 'epoch-a', 'device-b', 'epoch-b'].map(lengthText), sessionId
  ])).digest();
  const info = Buffer.concat([Buffer.from('Foliole framed sync v22 session'), Buffer.of(0), contextId]);
  const key = Buffer.from(hkdfSync('sha256', groupKey, sessionId, info, 32));
  const noncePrefix = Buffer.from([5, 6, 7, 8]);
  const preamble = Buffer.alloc(96); preamble.write('FOLSYNC2');
  preamble.writeUInt16BE(96, 8); preamble.writeUInt16BE(22, 10); preamble[12] = 1;
  contextId.copy(preamble, 16); sessionId.copy(preamble, 48); noncePrefix.copy(preamble, 64);
  const plaintext = Buffer.from('session-vector');
  const header = Buffer.alloc(16); header.writeUInt32BE(plaintext.length + 16); header.writeUInt16BE(1, 12);
  const nonce = Buffer.alloc(12); noncePrefix.copy(nonce);
  const cipher = createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(Buffer.concat([preamble, header]));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return {
    aad_hex: Buffer.concat([preamble, header]).toString('hex'),
    ciphertext_hex: ciphertext.toString('hex'), context_id_hex: contextId.toString('hex'),
    frame_header_hex: header.toString('hex'), hkdf_info_hex: info.toString('hex'),
    key_hex: key.toString('hex'), nonce_hex: nonce.toString('hex'),
    plaintext_hex: plaintext.toString('hex'), preamble_hex: preamble.toString('hex'),
    session_id_hex: sessionId.toString('hex')
  };
}

function malformedFrameHeader(name, ciphertextBytes, frameType, flags = 0) {
  const header = Buffer.alloc(16); header.writeUInt32BE(ciphertextBytes);
  header.writeUInt16BE(frameType, 12); header.writeUInt16BE(flags, 14);
  return { hex: header.toString('hex'), name };
}

function messageCases() {
  const transferId = new Uint8Array(32).fill(0x11);
  const contentId = new Uint8Array(32).fill(0x22);
  const blobHash = new Uint8Array(32).fill(0x33);
  const roundId = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const identity = { factId: 'version-7', globalId: 'node-1', kind: 2, objectType: 'node' };
  const blob = { byteLength: 524_289, required: true, role: 1, sha256: blobHash };
  return [
    encodeCase('handshake', { handshake: { capabilities: [{ name: 'framed-sync', version: 1 }],
      deviceId: 'device-a', groupId: 'group-a', libraryEpoch: 'epoch-a', protocolVersion: 22,
      sessionId: roundId } }),
    encodeCase('handshake-acceptance', { handshakeAcceptance: { capabilities: [
      { name: 'framed-sync', version: 1 }
    ], protocolVersion: 22, sessionId: roundId } }),
    encodeCase('inventory-begin', { inventoryBegin: { entryCount: 1, roundId } }),
    encodeCase('inventory-chunk', { inventoryChunk: { chunkIndex: 1, entries: [{
      frontierFactIds: ['version-7'], globalId: 'node-1', objectType: 'node',
      requiredRelationIds: ['parent-1'], resourceHashes: [blobHash], reviewFactIds: ['review-1'],
      sharedStateHash: contentId
    }], roundId } }),
    encodeCase('inventory-end', { inventoryEnd: { inventoryHash: contentId, roundId } }),
    encodeCase('difference-request', { differenceRequest: {
      blobHashes: [blobHash], facts: [identity], roundId
    } }),
    encodeCase('transfer-proposal', { transferProposal: {
      blobCount: 1, contentId, factCount: 1, receiverDeviceId: 'device-b',
      receiverLibraryEpoch: 'epoch-b', senderDeviceId: 'device-a', senderLibraryEpoch: 'epoch-a',
      totalBlobBytes: 524_289, transferId
    } }),
    encodeCase('blob-offer', { blobOffer: { blobs: [blob], transferId } }),
    encodeCase('missing-blob-set', { missingBlobSet: { missingHashes: [blobHash], transferId } }),
    encodeCase('transfer-header', { transferHeader: { attemptId: roundId, manifest: {
      blobs: [blob], contentId, facts: [{ identity, requiredBlobHashes: [blobHash],
        sharedStateHash: contentId }], groupId: 'group-a', protocolVersion: 22
    }, transferId } }),
    encodeCase('fact', { fact: { blobs: [blob], body: { fields: [{ name: 'title', value: {
      stringValue: 'Article'
    } }] }, identity, sharedStateHash: contentId } }),
    encodeCase('blob-chunk', { blobChunk: {
      blobHash, data: Uint8Array.of(0), offset: 524_288, transferId
    } }),
    encodeCase('transfer-trailer', { transferTrailer: {
      blobCount: 1, factCount: 1, manifestHash: contentId, transferId
    } }),
    encodeCase('transfer-receipt', { transferReceipt: {
      appliedStateHash: blobHash, contentId, receiverDeviceId: 'device-b',
      receiverLibraryEpoch: 'epoch-b', transferId
    } }),
    encodeCase('round-receipt', { roundReceipt: {
      deferredFacts: [identity], result: 2, roundId
    } }),
    encodeCase('transfer-termination', { transferTermination: {
      acknowledged: true, memberId: 'device-b', transferId
    } }),
    encodeCase('protocol-error', { error: {
      code: 2, message: 'limit exceeded', transferId
    } })
  ];
}

function blobContractVector() {
  const bytes = Uint8Array.from({ length: 524_289 }, (_, index) => index % 251);
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  return {
    byte_length: bytes.byteLength,
    byte_pattern: 'byte_at_offset_equals_offset_mod_251',
    chunks: [
      { byte_length: 524_288, offset: 0, sha256_hex: hash(bytes.subarray(0, 524_288)) },
      { byte_length: 1, offset: 524_288, sha256_hex: hash(bytes.subarray(524_288)) }
    ],
    empty_sha256_hex: hash(new Uint8Array()),
    sha256_hex: hash(bytes),
    wrong_last_chunk_sha256_hex: hash(Uint8Array.of(bytes[524_288] ^ 0xff))
  };
}

async function schemaDigest() {
  return createHash('sha256').update(await readFile(PROTO_PATH)).digest('hex');
}

async function document() {
  return `${JSON.stringify({
    blob_contract: blobContractVector(),
    canonical: {
      content_id_hex: 'd2dca32bfb3f929303143a893241d87c1ed85088c1ca6db8e3230a47b7d9c13c',
      manifest_base64: 'AAAAHmZvbGlvbGUtZnJhbWVkLXN5bmMtY29udGVudC12MQAAAAIAAAACAAAABG5vZGUAAAAGbm9kZS0xAAAACXZlcnNpb24tNwAAACBERERERERERERERERERERERERERERERERERERERERERAAAAAMAAAAHZGVsZXRlZAEAAAAIcmV2aXNpb24EAAAAAAAAAAcAAAAFdGl0bGUFAAAAEEEgZnJhbWVkIGFydGljbGUAAAABAAAAIHd3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3AAAAAAAAACoAAAABAQAAAAQAAAAGcmV2aWV3AAAABm5vZGUtMQAAAAhyZXZpZXctMwAAACBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQAAAAIAAAAEbm90ZQAAAAAGcmF0aW5nA///////////AAAAAQAAACBmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZgAAAAAAAAIAAAAAAgAAAAACAAAAIGZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmAAAAAAAAAgAAAAACAAAAACB3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3dwAAAAAAAAAqAAAAAQE=',
      transfer_id_hex: '1f2e3a7a1512d4495ce41664551701547c5c18daede9ab3648318e8bea71775d'
    },
    corpus_version: 1,
    crypto: { session: sessionCryptoVector(), transfer: transferCryptoVector() },
    malformed: [
      malformedFrameHeader('wire-frame-length-over-decoded-frame-and-tag', 2 * 1024 * 1024 + 17, 3),
      malformedFrameHeader('wire-frame-length-u32-max', 0xffff_ffff, 3),
      malformedFrameHeader('unspecified-frame-type', 16, 0),
      malformedFrameHeader('nonzero-frame-flags', 16, 3, 1)
    ],
    messages: messageCases(),
    protocol_version: 22,
    schema_sha256: await schemaDigest()
  }, null, 2)}\n`;
}

const expected = await document();
const expectedMalicious = maliciousCorpusDocument(protocolMessage, maliciousFrameTypes);
const expectedSchema = `${JSON.stringify(protobufRoot.toJSON(), null, 2)}\n`;
if (process.argv.includes('--check')) {
  const actual = await readFile(OUTPUT, 'utf8').catch(() => '');
  const actualMalicious = await readFile(MALICIOUS_OUTPUT, 'utf8').catch(() => '');
  const actualSchema = await readFile(SCHEMA_OUTPUT, 'utf8').catch(() => '');
  if (actual !== expected || actualMalicious !== expectedMalicious || actualSchema !== expectedSchema) {
    process.stderr.write('framed sync golden corpus or production schema is stale\n');
    process.exitCode = 1;
  }
} else {
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, expected);
  await writeFile(MALICIOUS_OUTPUT, expectedMalicious);
  await mkdir(path.dirname(SCHEMA_OUTPUT), { recursive: true });
  await writeFile(SCHEMA_OUTPUT, expectedSchema);
}
