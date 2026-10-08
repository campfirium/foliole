import protobuf from 'protobufjs';

const MAX_SEGMENT_BYTES = 64 * 1024;
const STRING_SEGMENT_UNITS = 16 * 1024;
const encoder = new TextEncoder();
const FACT_TYPES = new Set([
  'ProtocolMessage', 'FactRecord', 'FactIdentity', 'BlobReference',
  'CanonicalObject', 'CanonicalField', 'CanonicalValue', 'CanonicalList'
]);
type Encoding =
  | Readonly<{ kind: 'bytes'; bytes: Uint8Array; length: number }>
  | Readonly<{ kind: 'string'; value: string; length: number }>
  | Readonly<{ kind: 'message'; parts: readonly Encoding[]; length: number }>;

const byteEncoding = (bytes: Uint8Array): Encoding => ({ kind: 'bytes',
  bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), length: bytes.byteLength });

function delimited(field: protobuf.Field, value: Encoding): Encoding {
  const prefix = protobuf.Writer.create().uint32((field.id << 3) | 2).uint32(value.length).finish();
  return { kind: 'message', parts: [byteEncoding(prefix), value], length: prefix.byteLength + value.length };
}

function present(field: protobuf.Field, message: Record<string, unknown>) {
  const value = message[field.name];
  if (value === null || value === undefined || !Object.hasOwn(message, field.name)) return false;
  if (field.hasPresence) return true;
  if (field.type === 'string') return value !== '';
  if (field.type === 'bytes') return value instanceof Uint8Array && value.byteLength !== 0;
  return true;
}

function fieldEncoding(type: protobuf.Type, field: protobuf.Field, value: unknown): Encoding {
  if (field.resolvedType instanceof protobuf.Type) {
    return delimited(field, messageEncoding(field.resolvedType, value));
  }
  if (field.type === 'string' && typeof value === 'string') {
    return delimited(field, { kind: 'string', value, length: protobuf.util.utf8.length(value) });
  }
  if (field.type === 'bytes' && value instanceof Uint8Array) return delimited(field, byteEncoding(value));
  if (field.resolvedType instanceof protobuf.Enum || ['bool', 'uint32', 'uint64', 'sint64'].includes(field.type)) {
    return byteEncoding(type.encode(type.create({ [field.name]: value })).finish());
  }
  throw new Error('framed_sync_fact_encoding_schema_unsupported');
}

function messageEncoding(type: protobuf.Type, value: unknown): Encoding {
  if (!FACT_TYPES.has(type.name) || !value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('framed_sync_fact_encoding_schema_unsupported');
  }
  const message = value as Record<string, unknown>;
  if (Object.hasOwn(message, '$unknowns')) {
    throw new Error('framed_sync_fact_encoding_schema_unsupported');
  }
  const parts: Encoding[] = [];
  for (const field of [...type.fieldsArray].sort((left, right) => left.id - right.id)) {
    field.resolve();
    if (field.map || (field.repeated && !(field.resolvedType instanceof protobuf.Type))) {
      throw new Error('framed_sync_fact_encoding_schema_unsupported');
    }
    if (field.repeated) {
      const items = message[field.name];
      if (Array.isArray(items)) for (const item of items) parts.push(fieldEncoding(type, field, item));
    } else if (present(field, message)) {
      if (type.name === 'ProtocolMessage' && field.name !== 'fact') {
        throw new Error('framed_sync_fact_encoding_schema_unsupported');
      }
      parts.push(fieldEncoding(type, field, message[field.name]));
    }
  }
  return { kind: 'message', parts, length: parts.reduce((sum, part) => sum + part.length, 0) };
}

function* segments(value: Encoding): Generator<Uint8Array> {
  if (value.kind === 'message') {
    for (const part of value.parts) yield* segments(part);
  } else if (value.kind === 'bytes') {
    for (let offset = 0; offset < value.length; offset += MAX_SEGMENT_BYTES) {
      yield value.bytes.subarray(offset, offset + MAX_SEGMENT_BYTES);
    }
  } else {
    for (let offset = 0; offset < value.value.length;) {
      let end = Math.min(offset + STRING_SEGMENT_UNITS, value.value.length);
      const last = value.value.charCodeAt(end - 1);
      if (end < value.value.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
      yield encoder.encode(value.value.slice(offset, end));
      offset = end;
    }
  }
}

/** Only the validated fact schema is supported; every container length is exact. */
export function* streamFactProtocolEncoding(type: protobuf.Type, value: unknown): Generator<Uint8Array> {
  yield* segments(messageEncoding(type, value));
}
