import { Buffer } from 'node:buffer';

const MAX_CAPABILITIES = 64;
const MAX_CANONICAL_DEPTH = 32;
const UINT64_MAX = '18446744073709551615';

function bytes(value, size = 32) {
  return new Uint8Array(size).fill(value);
}

function identity(overrides = {}) {
  return { factId: 'version-1', globalId: 'node-1', kind: 2, objectType: 'node', ...overrides };
}

function fact(overrides = {}) {
  return {
    blobs: [],
    body: { fields: [{ name: 'title', value: { stringValue: 'Article' } }] },
    identity: identity(),
    sharedStateHash: bytes(1),
    ...overrides
  };
}

function nestedValue(depth) {
  let value = { nullValue: true };
  for (let index = 0; index < depth; index += 1) {
    value = { listValue: { values: [value] } };
  }
  return value;
}

function encodeCase(protocolMessage, input) {
  const value = { [input.property]: input.payload };
  const message = protocolMessage.fromObject(value);
  const structuralError = protocolMessage.verify(message);
  if (structuralError) throw new Error(`invalid_malicious_case_${input.name}:${structuralError}`);
  const encoded = protocolMessage.encode(message).finish();
  const encodedCase = {
    base64: Buffer.from(encoded).toString('base64'),
    byte_length: encoded.byteLength,
    frame_type: input.frameType,
    name: input.name,
    payload_case: input.payloadCase
  };
  return input.expectedError === undefined
    ? encodedCase
    : { ...encodedCase, expected_error: input.expectedError };
}

function handshake(capabilities) {
  return {
    capabilities, deviceId: 'device-a', groupId: 'group-a', libraryEpoch: 'epoch-a',
    protocolVersion: 22, sessionId: bytes(3, 16)
  };
}

export function acceptedBoundaryCases(protocolMessage, frameTypes) {
  const cases = [
    {
      frameType: frameTypes.fact, name: 'canonical-depth-exact',
      payload: fact({ body: { fields: [{
        name: 'nested', value: nestedValue(MAX_CANONICAL_DEPTH - 1)
      }] } }), payloadCase: 'fact', property: 'fact'
    },
    {
      frameType: frameTypes.sessionControl, name: 'capability-count-exact',
      payload: handshake(Array.from({ length: MAX_CAPABILITIES }, (_, index) => ({
        name: `cap-${index}`, version: 1
      }))), payloadCase: 'handshake', property: 'handshake'
    },
    {
      frameType: frameTypes.fact, name: 'uint64-max-exact', payload: fact({ body: { fields: [{
        name: 'unsigned', value: { unsignedValue: UINT64_MAX }
      }] } }), payloadCase: 'fact', property: 'fact'
    }
  ];
  return cases.map((input) => encodeCase(protocolMessage, input));
}

export function maliciousProtocolCases(protocolMessage, frameTypes) {
  const cases = [
    {
      expectedError: 'fact_kind_invalid', frameType: frameTypes.fact,
      name: 'unspecified-fact-kind', payload: fact({ identity: identity({ kind: 0 }) }),
      payloadCase: 'fact', property: 'fact'
    },
    {
      expectedError: 'protocol_string_required', frameType: frameTypes.fact,
      name: 'empty-fact-id', payload: fact({ identity: identity({ factId: '' }) }),
      payloadCase: 'fact', property: 'fact'
    },
    {
      expectedError: 'shared_state_hash_must_be_32_bytes', frameType: frameTypes.fact,
      name: 'short-shared-state-hash', payload: fact({ sharedStateHash: bytes(1, 31) }),
      payloadCase: 'fact', property: 'fact'
    },
    {
      expectedError: 'shared_state_hash_must_be_32_bytes', frameType: frameTypes.fact,
      name: 'long-shared-state-hash', payload: fact({ sharedStateHash: bytes(1, 33) }),
      payloadCase: 'fact', property: 'fact'
    },
    {
      expectedError: 'blob_role_invalid', frameType: frameTypes.fact,
      name: 'unknown-blob-role', payload: fact({ blobs: [{
        byteLength: 1, required: true, role: 9, sha256: bytes(2)
      }] }), payloadCase: 'fact', property: 'fact'
    },
    {
      expectedError: 'canonical_field_duplicate', frameType: frameTypes.fact,
      name: 'duplicate-canonical-field', payload: fact({ body: { fields: [
        { name: 'title', value: { stringValue: 'A' } },
        { name: 'title', value: { stringValue: 'B' } }
      ] } }), payloadCase: 'fact', property: 'fact'
    },
    {
      expectedError: 'canonical_null_invalid', frameType: frameTypes.fact,
      name: 'false-null-marker', payload: fact({ body: { fields: [
        { name: 'empty', value: { nullValue: false } }
      ] } }), payloadCase: 'fact', property: 'fact'
    },
    {
      expectedError: 'capability_duplicate', frameType: frameTypes.sessionControl,
      name: 'duplicate-capability-name', payload: handshake([
        { name: 'same', version: 1 }, { name: 'same', version: 2 }
      ]), payloadCase: 'handshake', property: 'handshake'
    },
    {
      expectedError: 'protocol_repeated_limit_exceeded', frameType: frameTypes.sessionControl,
      name: 'capability-count-over-limit', payload: handshake(
        Array.from({ length: MAX_CAPABILITIES + 1 }, (_, index) => ({
          name: `cap-${index}`, version: 1
        }))
      ), payloadCase: 'handshake', property: 'handshake'
    },
    {
      expectedError: 'canonical_depth_limit_exceeded', frameType: frameTypes.fact,
      name: 'canonical-depth-over-limit', payload: fact({ body: { fields: [
        { name: 'nested', value: nestedValue(MAX_CANONICAL_DEPTH) }
      ] } }), payloadCase: 'fact', property: 'fact'
    },
    {
      expectedError: 'blob_chunk_range_invalid', frameType: frameTypes.blobChunk,
      name: 'uint64-addition-overflow', payload: {
        blobHash: bytes(2), data: Uint8Array.of(1), offset: UINT64_MAX,
        transferId: bytes(1)
      }, payloadCase: 'blob_chunk', property: 'blobChunk'
    },
    {
      expectedError: 'frame_payload_type_mismatch', frameType: frameTypes.transferHeader,
      name: 'fact-authenticated-as-transfer-header', payload: fact(),
      payloadCase: 'fact', property: 'fact'
    }
  ];
  return cases.map((input) => encodeCase(protocolMessage, input));
}

export function maliciousCorpusDocument(protocolMessage, frameTypes) {
  return `${JSON.stringify({
    accepted_messages: acceptedBoundaryCases(protocolMessage, frameTypes),
    corpus_version: 1,
    messages: maliciousProtocolCases(protocolMessage, frameTypes),
    protocol_version: 22
  }, null, 2)}\n`;
}
