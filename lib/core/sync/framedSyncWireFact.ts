import type {
  CanonicalBlob,
  CanonicalFact,
  CanonicalField,
  CanonicalValue
} from './framedSyncCanonicalManifest.js';
import type { ValidatedProtocolMessage } from './framedSyncProtocolCodec.js';

type WireValue = Readonly<Record<string, unknown>>;

const record = (value: unknown) => value as WireValue;
const bytes = (value: unknown) => new Uint8Array(value as Uint8Array);
const integer = (value: unknown) => BigInt(String(value));

function wireValue(value: unknown): CanonicalValue {
  const item = record(value);
  if (item.nullValue !== undefined) return { kind: 'null' };
  if (item.boolValue !== undefined) return { kind: 'bool', value: Boolean(item.boolValue) };
  if (item.signedValue !== undefined) return { kind: 'signed', value: integer(item.signedValue) };
  if (item.unsignedValue !== undefined) return { kind: 'unsigned', value: integer(item.unsignedValue) };
  if (item.stringValue !== undefined) return { kind: 'string', value: String(item.stringValue) };
  if (item.bytesValue !== undefined) return { kind: 'bytes', value: bytes(item.bytesValue) };
  if (item.listValue !== undefined) {
    return { kind: 'list', value: (record(item.listValue).values as unknown[]).map(wireValue) };
  }
  return { kind: 'object', value: (record(item.objectValue).fields as unknown[]).map(wireField) };
}

function wireField(value: unknown): CanonicalField {
  const item = record(value);
  return { name: String(item.name), value: wireValue(item.value) };
}

function wireBlob(value: unknown): CanonicalBlob {
  const item = record(value);
  return {
    byteLength: integer(item.byteLength),
    required: Boolean(item.required),
    role: Number(item.role),
    sha256: bytes(item.sha256)
  };
}

export function canonicalFactFromValidatedMessage(message: ValidatedProtocolMessage): CanonicalFact {
  if (message.payloadCase !== 'fact') throw new Error('framed_sync_fact_payload_required');
  const item = message.payload;
  const identity = record(item.identity);
  const body = record(item.body);
  return {
    blobs: (item.blobs as unknown[]).map(wireBlob),
    body: (body.fields as unknown[]).map(wireField),
    factId: String(identity.factId),
    globalId: String(identity.globalId),
    kind: Number(identity.kind),
    objectType: String(identity.objectType),
    sharedStateHash: bytes(item.sharedStateHash)
  };
}
