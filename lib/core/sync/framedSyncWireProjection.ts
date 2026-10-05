import protobuf from 'protobufjs';

import type {
  CanonicalBlob,
  CanonicalFact,
  CanonicalField,
  CanonicalManifest,
  CanonicalValue
} from './framedSyncCanonicalManifest.js';

type Row = Record<string, unknown>;
type LongFactory = Readonly<{
  fromString(value: string, unsigned?: boolean): Readonly<{
    high: number;
    low: number;
    unsigned: boolean;
  }>;
}>;

const row = (value: unknown) => value as Row;
const bytes = (value: unknown) => new Uint8Array(value as Uint8Array);
const integer = (value: unknown) => BigInt(String(value));
const longFactory = protobuf.util.Long as unknown as LongFactory;

export const wireUint64 = (value: bigint) => longFactory.fromString(value.toString(), true);
const wireInt64 = (value: bigint) => longFactory.fromString(value.toString(), false);

function valueToWire(value: CanonicalValue): Row {
  if (value.kind === 'null') return { nullValue: true };
  if (value.kind === 'bool') return { boolValue: value.value };
  if (value.kind === 'signed') return { signedValue: wireInt64(value.value) };
  if (value.kind === 'unsigned') return { unsignedValue: wireUint64(value.value) };
  if (value.kind === 'string') return { stringValue: value.value };
  if (value.kind === 'bytes') return { bytesValue: value.value };
  if (value.kind === 'list') return { listValue: { values: value.value.map(valueToWire) } };
  return { objectValue: { fields: value.value.map(fieldToWire) } };
}

function wireToValue(value: unknown): CanonicalValue {
  const item = row(value);
  if (item.nullValue !== undefined) return { kind: 'null' };
  if (item.boolValue !== undefined) return { kind: 'bool', value: Boolean(item.boolValue) };
  if (item.signedValue !== undefined) return { kind: 'signed', value: integer(item.signedValue) };
  if (item.unsignedValue !== undefined) return { kind: 'unsigned', value: integer(item.unsignedValue) };
  if (item.stringValue !== undefined) return { kind: 'string', value: String(item.stringValue) };
  if (item.bytesValue !== undefined) return { kind: 'bytes', value: bytes(item.bytesValue) };
  if (item.listValue !== undefined) {
    return { kind: 'list', value: (row(item.listValue).values as unknown[]).map(wireToValue) };
  }
  return { kind: 'object', value: (row(item.objectValue).fields as unknown[]).map(wireToField) };
}

const fieldToWire = (field: CanonicalField) => ({ name: field.name, value: valueToWire(field.value) });
const wireToField = (value: unknown): CanonicalField => {
  const item = row(value);
  return { name: String(item.name), value: wireToValue(item.value) };
};

export const blobToWire = (blob: CanonicalBlob) => ({
  byteLength: wireUint64(blob.byteLength), required: blob.required, role: blob.role, sha256: blob.sha256
});

export function wireToBlob(value: unknown): CanonicalBlob {
  const item = row(value);
  return { byteLength: integer(item.byteLength), required: Boolean(item.required),
    role: Number(item.role), sha256: bytes(item.sha256) };
}

export function factToWire(fact: CanonicalFact) {
  return {
    blobs: fact.blobs.map(blobToWire), body: { fields: fact.body.map(fieldToWire) },
    identity: { factId: fact.factId, globalId: fact.globalId, kind: fact.kind, objectType: fact.objectType },
    sharedStateHash: fact.sharedStateHash
  };
}

export function wireToFact(value: unknown): CanonicalFact {
  const item = row(value); const identity = row(item.identity); const body = row(item.body);
  return {
    blobs: (item.blobs as unknown[]).map(wireToBlob),
    body: (body.fields as unknown[]).map(wireToField),
    factId: String(identity.factId), globalId: String(identity.globalId),
    kind: Number(identity.kind), objectType: String(identity.objectType),
    sharedStateHash: bytes(item.sharedStateHash)
  };
}

export function manifestToWire(manifest: CanonicalManifest, groupId: string, contentId: Uint8Array) {
  return {
    blobs: manifest.blobs.map(blobToWire), contentId,
    facts: manifest.facts.map((fact) => ({
      identity: { factId: fact.factId, globalId: fact.globalId, kind: fact.kind, objectType: fact.objectType },
      requiredBlobHashes: fact.blobs.filter((blob) => blob.required).map((blob) => blob.sha256),
      sharedStateHash: fact.sharedStateHash
    })),
    groupId, protocolVersion: 22
  };
}
