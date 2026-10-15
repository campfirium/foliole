import { z } from 'zod';

import type { DbPort, DbRow } from '../sync/dbPort.js';
import type { CanonicalManifest, CanonicalValue } from '../sync/framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from '../sync/framedSyncContract.js';
import { decodePublicationInventory } from '../sync/framedSyncPublicationInventory.js';
import type { OutboundPublishInput } from '../sync/framedSyncStagingContract.js';

const storedBytes = z.array(z.number().int().min(0).max(255)).transform((value) => Uint8Array.from(value));
const unsigned = z.string().regex(/^\d+$/).transform(BigInt);
const signed = z.string().regex(/^-?\d+$/).transform(BigInt);
const storedValue: z.ZodType<CanonicalValue> = z.lazy(() => z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('null') }), z.object({ kind: z.literal('bool'), value: z.boolean() }),
  z.object({ kind: z.literal('bytes'), value: storedBytes }),
  z.object({ kind: z.literal('signed'), value: signed }), z.object({ kind: z.literal('unsigned'), value: unsigned }),
  z.object({ kind: z.literal('string'), value: z.string() }),
  z.object({ kind: z.literal('list'), value: z.array(storedValue) }),
  z.object({ kind: z.literal('object'), value: z.array(z.object({ name: z.string(), value: storedValue })) })
]));
const storedBlob = z.object({ byteLength: unsigned, required: z.boolean(), role: z.number().int(), sha256: storedBytes });
const storedManifest: z.ZodType<CanonicalManifest> = z.object({
  blobs: z.array(storedBlob), facts: z.array(z.object({
    blobs: z.array(storedBlob), body: z.array(z.object({ name: z.string(), value: storedValue })),
    factId: z.string(), globalId: z.string(), kind: z.number().int(), objectType: z.string(), sharedStateHash: storedBytes
  }))
});

function stringify(value: unknown) {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'bigint') return item.toString();
    return item instanceof Uint8Array ? [...item] : item;
  });
}

export function encodeFramedSyncManifest(value: CanonicalManifest) { return stringify(value); }
export function decodeFramedSyncManifest(value: string) { return storedManifest.parse(JSON.parse(value)); }
export function framedSyncBytes(row: DbRow, name: string) {
  const value = row[name];
  if (!(value instanceof Uint8Array)) throw new Error(`framed_sync_invalid_${name}`);
  return new Uint8Array(value);
}
export function framedSyncText(row: DbRow, name: string) {
  const value = row[name];
  if (typeof value !== 'string') throw new Error(`framed_sync_invalid_${name}`);
  return value;
}
export function framedSyncBigInt(row: DbRow, name: string) {
  const value = row[name];
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    throw new Error(`framed_sync_invalid_${name}`);
  }
  return BigInt(value);
}
export async function readFramedSyncRow<T extends DbRow = DbRow>(
  db: DbPort, sql: string, params: readonly (string | number | bigint | Uint8Array | null)[] = []
) { return (await db.query<T>(sql, params))[0] ?? null; }
export function readFramedSyncContext(row: DbRow): FramedSyncContext {
  if (row.protocol_version !== FRAMED_SYNC_PROTOCOL_VERSION) throw new Error('framed_sync_protocol_version_unsupported');
  return { groupId: framedSyncText(row, 'group_id'), protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    receiverDeviceId: framedSyncText(row, 'receiver_device_id'),
    receiverLibraryEpoch: framedSyncText(row, 'receiver_library_epoch'),
    senderDeviceId: framedSyncText(row, 'sender_device_id'),
    senderLibraryEpoch: framedSyncText(row, 'sender_library_epoch') };
}
export function readFramedSyncPublication(row: DbRow): OutboundPublishInput {
  const inventoryDifference = decodePublicationInventory(framedSyncText(row, 'manifest_json'));
  return { ...(inventoryDifference ? { inventoryDifference } : {}),
    contentId: framedSyncBytes(row, 'content_id'), context: readFramedSyncContext(row),
    manifest: decodeFramedSyncManifest(framedSyncText(row, 'manifest_json')),
    manifestHash: framedSyncBytes(row, 'manifest_hash'), transferId: framedSyncBytes(row, 'transfer_id') };
}
export function sameFramedSyncBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

export function failFramedSync(name: string): never { throw new Error(name); }
