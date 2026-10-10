import protobuf from 'protobufjs';

const MAX_SEGMENT_BYTES = 64 * 1024;
const STRING_SEGMENT_UNITS = 16 * 1024;
const encoder = new TextEncoder();
const FACT_TYPES = new Set([
  'ProtocolMessage', 'FactRecord', 'FactIdentity', 'BlobReference',
  'CanonicalObject', 'CanonicalField', 'CanonicalValue', 'CanonicalList'
]);
const orderedFields = new WeakMap<protobuf.Type, readonly protobuf.Field[]>();
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

function encodingMessage(type: protobuf.Type, value: unknown) {
  if (!FACT_TYPES.has(type.name) || !value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('framed_sync_fact_encoding_schema_unsupported');
  }
  const message = value as Record<string, unknown>;
  if (Object.hasOwn(message, '$unknowns')) {
    throw new Error('framed_sync_fact_encoding_schema_unsupported');
  }
  return message;
}

function fields(type: protobuf.Type) {
  let sorted = orderedFields.get(type);
  if (!sorted) {
    sorted = [...type.fieldsArray].sort((left, right) => left.id - right.id);
    for (const field of sorted) {
      field.resolve();
      if (field.map || (field.repeated && !(field.resolvedType instanceof protobuf.Type))) {
        throw new Error('framed_sync_fact_encoding_schema_unsupported');
      }
    }
    orderedFields.set(type, sorted);
  }
  return sorted;
}

function messageEncoding(type: protobuf.Type, value: unknown): Encoding {
  const message = encodingMessage(type, value);
  const parts: Encoding[] = [];
  for (const field of fields(type)) {
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

function varintLength(value: number) {
  let remaining = value >>> 0;
  let length = 1;
  while (remaining > 127) { remaining >>>= 7; length += 1; }
  return length;
}

function fieldByteLength(type: protobuf.Type, field: protobuf.Field, value: unknown, writer: protobuf.Writer): number {
  let length: number;
  if (field.resolvedType instanceof protobuf.Type) length = messageByteLength(field.resolvedType, value, writer);
  else if (field.type === 'string' && typeof value === 'string') length = protobuf.util.utf8.length(value);
  else if (field.type === 'bytes' && value instanceof Uint8Array) length = value.byteLength;
  else if (field.resolvedType instanceof protobuf.Enum || ['bool', 'uint32', 'uint64', 'sint64'].includes(field.type)) {
    return type.encode(type.create({ [field.name]: value }), writer.reset()).pos;
  } else throw new Error('framed_sync_fact_encoding_schema_unsupported');
  return varintLength((field.id << 3) | 2) + varintLength(length) + length;
}

function messageByteLength(type: protobuf.Type, value: unknown, writer: protobuf.Writer): number {
  const message = encodingMessage(type, value);
  let length = 0;
  for (const field of fields(type)) {
    if (field.repeated) {
      const items = message[field.name];
      if (Array.isArray(items)) for (const item of items) length += fieldByteLength(type, field, item, writer);
    } else if (present(field, message)) {
      if (type.name === 'ProtocolMessage' && field.name !== 'fact') {
        throw new Error('framed_sync_fact_encoding_schema_unsupported');
      }
      length += fieldByteLength(type, field, message[field.name], writer);
    }
  }
  return length;
}

/** Measure the validated schema without building its encoding tree or string/byte payloads. */
export function factProtocolByteLength(type: protobuf.Type, value: unknown) {
  return messageByteLength(type, value, protobuf.Writer.create());
}

function* segments(value: Encoding): Generator<Uint8Array> {
  const pending = [value];
  while (pending.length) {
    const next = pending.pop()!;
    if (next.kind === 'message') {
      for (let index = next.parts.length - 1; index >= 0; index -= 1) pending.push(next.parts[index]!);
    } else if (next.kind === 'bytes') {
      for (let offset = 0; offset < next.length; offset += MAX_SEGMENT_BYTES) {
        yield next.bytes.subarray(offset, offset + MAX_SEGMENT_BYTES);
      }
    } else {
      for (let offset = 0; offset < next.value.length;) {
        let end = Math.min(offset + STRING_SEGMENT_UNITS, next.value.length);
        const last = next.value.charCodeAt(end - 1);
        if (end < next.value.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
        yield encoder.encode(next.value.slice(offset, end));
        offset = end;
      }
    }
  }
}

/** Only the validated fact schema is supported; every container length is exact. */
export function* streamFactProtocolEncoding(type: protobuf.Type, value: unknown): Generator<Uint8Array> {
  yield* segments(messageEncoding(type, value));
}
