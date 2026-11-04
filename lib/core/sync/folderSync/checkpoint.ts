import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import { attachmentBlockResourceSchema } from '../attachmentBlockReceiver.js';
import type { FramedSyncFilePort } from '../framedSyncFilePort.js';
import type { FramedSyncInventoryEntry } from '../framedSyncInventory.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage } from '../framedSyncProtocolCodec.js';
import { frameTypeForPayload } from '../framedSyncReceiver.js';
import { decodeRequestSyncInventory, iterateRequestSyncInventory } from '../requestSyncInventoryWire.js';
import type { RequestSyncMessage } from '../requestSyncObjectMessages.js';

const frameSchema = z.object({ key: z.string().regex(/^folder-sync\/objects\/[a-f0-9]{64}\.pb$/u),
  type: z.union([z.literal(1), z.literal(3), z.literal(4)]) });
const checkpointSchema = z.object({ format: z.literal(1), sourceId: z.string().min(1),
  generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  inventory: z.array(frameSchema),
  objects: z.array(z.object({ objectType: z.string().min(1), globalId: z.string().min(1),
    contextId: z.string().regex(/^[a-f0-9]{64}$/u), frames: z.array(frameSchema) })),
  resources: z.array(attachmentBlockResourceSchema), pendingResources: z.array(z.string()) });
export type FolderSyncCheckpoint = z.infer<typeof checkpointSchema>;
export type FolderSyncStoredFrame = z.infer<typeof frameSchema>;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const digest = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
export const folderSyncCheckpointKey = (slot: number) => `folder-sync/checkpoint-${slot}.json`;

export async function storeFolderSyncMessage(files: FramedSyncFilePort, message: RequestSyncMessage,
  check: () => void): Promise<{ frame: FolderSyncStoredFrame; bytesWritten: number }> {
  return storeFolderSyncEncodedMessage(files, encodeValidatedProtocolMessage(message.payloadCase, message.payload),
    frameTypeForPayload(message.payloadCase), check);
}

/** Preserve the producer's validated protobuf bytes; decoded uint64 strings must not be re-encoded. */
export async function storeFolderSyncEncodedMessage(files: FramedSyncFilePort, bytes: Uint8Array,
  type: number, check: () => void): Promise<{ frame: FolderSyncStoredFrame; bytesWritten: number }> {
  check();
  decodeAndValidateProtocolMessage(bytes, type);
  const frame: FolderSyncStoredFrame = { key: `folder-sync/objects/${digest(bytes)}.pb`,
    type: type as FolderSyncStoredFrame['type'] };
  const existing = await files.read(frame.key);
  if (existing && digest(existing) === digest(bytes)) return { frame, bytesWritten: 0 };
  await files.write(frame.key, bytes);
  await readFolderSyncMessage(files, frame);
  return { frame, bytesWritten: bytes.byteLength };
}

export async function readFolderSyncMessage(files: FramedSyncFilePort, frame: FolderSyncStoredFrame) {
  frameSchema.parse(frame);
  const bytes = await files.read(frame.key);
  if (!bytes || !frame.key.endsWith(`/${digest(bytes)}.pb`)) throw new Error('folder_sync_object_corrupt');
  return decodeAndValidateProtocolMessage(bytes, frame.type);
}

export async function storeFolderSyncInventory(files: FramedSyncFilePort,
  inventory: readonly FramedSyncInventoryEntry[], check: () => void) {
  const frames: FolderSyncStoredFrame[] = [];
  let bytesWritten = 0;
  for (const message of iterateRequestSyncInventory({ entries: inventory, roundId: crypto.getRandomValues(new Uint8Array(16)) })) {
    const stored = await storeFolderSyncMessage(files, message, check);
    frames.push(stored.frame);
    bytesWritten += stored.bytesWritten;
  }
  return { frames, bytesWritten };
}

export async function readFolderSyncInventory(files: FramedSyncFilePort, checkpoint: FolderSyncCheckpoint) {
  const result = await decodeRequestSyncInventory((async function* () {
    for (const frame of checkpoint.inventory) yield await readFolderSyncMessage(files, frame);
  })());
  return result.entries;
}

async function readSlot(files: FramedSyncFilePort, slot: number) {
  const bytes = await files.read(folderSyncCheckpointKey(slot));
  if (!bytes) return { exists: false, value: null };
  // Parsing/validation may reject a half-written inactive slot. Host I/O failures above remain errors.
  try {
    const envelope = z.object({ payload: z.string(), sha256: z.string() }).parse(JSON.parse(decoder.decode(bytes)));
    if (digest(encoder.encode(envelope.payload)) !== envelope.sha256) throw new Error('checkpoint_checksum');
    const value = checkpointSchema.parse(JSON.parse(envelope.payload));
    if (value.generation % 2 !== slot) throw new Error('checkpoint_generation_slot');
    return { exists: true, value };
  } catch { return { exists: true, value: null }; }
}

export async function loadFolderSyncCheckpoint(files: FramedSyncFilePort, sourceId: string) {
  const slots = await Promise.all([readSlot(files, 0), readSlot(files, 1)]);
  const valid = slots.flatMap(slot => slot.value ? [slot.value] : []);
  if (valid.some(value => value.sourceId !== sourceId)) throw new Error('folder_sync_different_source');
  valid.sort((a, b) => b.generation - a.generation);
  if (!valid.length && slots.some(slot => slot.exists)) throw new Error('folder_sync_checkpoint_corrupt');
  return valid[0] ?? null;
}

/** The destination owner must exclude every other writer. Only the inactive slot is replaced. */
export async function publishFolderSyncCheckpoint(files: FramedSyncFilePort,
  checkpoint: FolderSyncCheckpoint, check: () => void) {
  checkpointSchema.parse(checkpoint);
  const payload = JSON.stringify(checkpoint);
  const encoded = encoder.encode(JSON.stringify({ payload, sha256: digest(encoder.encode(payload)) }));
  check();
  await files.write(folderSyncCheckpointKey(checkpoint.generation % 2), encoded);
  check();
  const written = await readSlot(files, checkpoint.generation % 2);
  if (!written.value || written.value.generation !== checkpoint.generation) throw new Error('folder_sync_checkpoint_write_incomplete');
  return encoded.byteLength;
}
