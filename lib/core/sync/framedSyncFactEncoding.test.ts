import protobuf from 'protobufjs';
import { expect, it } from 'vitest';

import { canonicalManifestBytes, type CanonicalFact, type CanonicalValue } from './framedSyncCanonicalManifest.js';
import { streamFactProtocolEncoding } from './framedSyncFactEncoding.js';
import { assertNodeVersionFactShape, FRAMED_SYNC_NODE_VERSION_FACT } from './framedSyncNodeFactContract.js';
import { encodeValidatedProtocolMessage, streamValidatedFactProtocolMessage } from './framedSyncProtocolCodec.js';
import { factToWire } from './framedSyncWireProjection.js';

const string = (value: string): CanonicalValue => ({ kind: 'string', value });
const nil: CanonicalValue = { kind: 'null' };

function largeNodeFact(): CanonicalFact {
  const contract = FRAMED_SYNC_NODE_VERSION_FACT;
  const snapshot: Record<string, CanonicalValue> = Object.fromEntries(contract.snapshotFields.map((name) => [name, nil]));
  Object.assign(snapshot, {
    id: string('node-1'), kind: string('article'), title: string('t'.repeat(1_200_000)),
    opening_text: string('o'.repeat(1_200_000)), body_blob_hash: string('02'.repeat(32)),
    attachments: { kind: 'list', value: [] }, hide_title_heading: { kind: 'bool', value: false },
    is_title_manual: { kind: 'bool', value: true },
    created_at: string('2026-10-08T00:00:00.000Z'), updated_at: string('2026-10-08T00:00:00.000Z')
  });
  const body: Record<string, CanonicalValue> = Object.fromEntries(contract.bodyFields.map((name) => [name, nil]));
  Object.assign(body, {
    ancestor_version_ids: { kind: 'list', value: [] }, parent_version_ids: { kind: 'list', value: [] },
    content_hash: string('01'.repeat(32)), is_tombstone: { kind: 'bool', value: false },
    snapshot: { kind: 'object', value: contract.snapshotFields.map((name) => ({ name, value: snapshot[name]! })) },
    updated_at: string('2026-10-08T00:00:00.000Z')
  });
  return {
    blobs: [{ byteLength: 4n, required: true, role: 1, sha256: new Uint8Array(32).fill(2) }],
    body: contract.bodyFields.map((name) => ({ name, value: body[name]! })), factId: 'version-1',
    globalId: 'node-1', kind: 2, objectType: 'node', sharedStateHash: new Uint8Array(32).fill(1)
  };
}

function payload(values: readonly Record<string, unknown>[]) {
  return { blobs: [], body: { fields: values.map((value, index) => ({ name: `field-${index}`, value })) },
    identity: { factId: 'version-1', globalId: 'node-1', kind: 2, objectType: 'node' },
    sharedStateHash: new Uint8Array(32).fill(1) };
}

function assertExactEncoding(value: unknown) {
  const parts = [...streamValidatedFactProtocolMessage(value)];
  expect(parts.every((part) => part.byteLength <= 64 * 1024)).toBe(true);
  expect(Buffer.concat(parts)).toEqual(Buffer.from(encodeValidatedProtocolMessage('fact', value)));
  return parts;
}

it('streams a production-valid node snapshot exceeding one frame without changing protobuf bytes', () => {
  const fact = largeNodeFact();
  assertNodeVersionFactShape(fact);
  expect(canonicalManifestBytes({ facts: [fact], blobs: fact.blobs }).byteLength).toBeLessThan(8 * 1024 * 1024);
  const parts = assertExactEncoding(factToWire(fact));
  expect(parts.reduce((sum, part) => sum + part.byteLength, 0)).toBeGreaterThan(2 * 1024 * 1024);
});

it('preserves oneof defaults, signed and unsigned extremes, repeated values and nested objects', () => {
  assertExactEncoding(payload([
    { boolValue: false }, { signedValue: 0 }, { unsignedValue: 0 }, { stringValue: '' },
    { bytesValue: new Uint8Array() }, { nullValue: true },
    { signedValue: { low: 0, high: -2147483648, unsigned: false } },
    { unsignedValue: { low: -1, high: -1, unsigned: true } },
    { listValue: { values: [{ boolValue: true }, { objectValue: { fields: [{ name: 'child', value: { stringValue: '中😀' } }] } }] } }
  ]));
});

it('keeps surrogate pairs intact at string segment boundaries and borrows bounded byte slices', () => {
  const data = new Uint8Array(2 * 1024 * 1024).fill(7);
  const parts = assertExactEncoding(payload([
    { stringValue: `${'x'.repeat(16 * 1024 - 1)}😀${'中'.repeat(32 * 1024)}` }, { bytesValue: data }
  ]));
  const borrowed = parts.filter((part) => part.buffer === data.buffer);
  expect(borrowed).toHaveLength(32);
  expect(borrowed.reduce((sum, part) => sum + part.byteLength, 0)).toBe(data.byteLength);
});

it('rejects invalid input before yielding and refuses unsupported schema types', () => {
  expect(() => streamValidatedFactProtocolMessage(payload([{ stringValue: '\ud800' }])).next())
    .toThrow('protocol_unicode_invalid');
  expect(() => streamValidatedFactProtocolMessage({ ...payload([]), $unknowns: [Uint8Array.of(8, 1)] }).next())
    .toThrow('framed_sync_fact_encoding_schema_unsupported');
  const unknown = new protobuf.Type('Other').add(new protobuf.Field('value', 1, 'string'));
  expect(() => streamFactProtocolEncoding(unknown, { value: 'x' }).next())
    .toThrow('framed_sync_fact_encoding_schema_unsupported');
});
