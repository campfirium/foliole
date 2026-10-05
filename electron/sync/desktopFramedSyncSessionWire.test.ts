// @vitest-environment node

import { expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import type { FramedSyncSessionNoncePort } from '../../lib/core/sync/framedSyncSession.js';

import {
  decodeDesktopFramedSyncSession,
  encodeDesktopFramedSyncSession
} from './desktopFramedSyncSessionWire.js';
import { encodeFramedSyncStream, readFramedSyncStream } from './desktopFramedSyncStream.js';

const context = {
  groupId: 'group-1',
  initiatorDeviceId: 'device-a',
  initiatorLibraryEpoch: 'epoch-a',
  protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  responderDeviceId: 'device-b',
  responderLibraryEpoch: 'epoch-b'
} as const;
const groupKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const roundId = Uint8Array.from({ length: 16 }, () => 7);
const messages = [
  { payloadCase: 'inventory_begin' as const, payload: { entryCount: 0, roundId } },
  { payloadCase: 'inventory_chunk' as const,
    payload: { chunkIndex: 0, entries: [], roundId } },
  { payloadCase: 'inventory_end' as const,
    payload: { inventoryHash: new Uint8Array(32), roundId } }
];

function memoryNoncePort(onPersist?: () => void): FramedSyncSessionNoncePort {
  return {
    abandon: async () => undefined,
    persistBeforeEncryption: async () => {
      onPersist?.();
      return 'created';
    }
  };
}

async function collect(source: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) chunks.push(chunk.slice());
  return chunks;
}

async function source(chunks: readonly Uint8Array[]) {
  return readFramedSyncStream((async function* () { yield* chunks; })());
}

it('encrypts and authenticates a contiguous inventory session', async () => {
  let persisted = false;
  const encoded = await encodeDesktopFramedSyncSession({
    authenticatedContext: context, groupKey, messages,
    noncePort: memoryNoncePort(() => { persisted = true; })
  });
  expect(persisted).toBe(true);
  const wire = await source(await collect(encodeFramedSyncStream(encoded)));

  const decoded = await decodeDesktopFramedSyncSession({
    authenticatedContext: context, authorDeviceId: 'device-a', groupKey, ...wire
  });

  expect(decoded.map((message) => message.payloadCase)).toEqual([
    'inventory_begin', 'inventory_chunk', 'inventory_end'
  ]);
});

it('rejects tampered ciphertext and a non-contiguous sequence', async () => {
  const encoded = await encodeDesktopFramedSyncSession({
    authenticatedContext: context, groupKey, messages,
    noncePort: memoryNoncePort()
  });
  const chunks = await collect(encodeFramedSyncStream(encoded));
  const ciphertext = chunks[2]!;
  ciphertext[0] = ciphertext[0]! ^ 1;
  const tampered = await source(chunks);
  await expect(decodeDesktopFramedSyncSession({
    authenticatedContext: context, authorDeviceId: 'device-a', groupKey, ...tampered
  })).rejects.toThrow('frame_authentication_failed');

  const fresh = await encodeDesktopFramedSyncSession({
    authenticatedContext: context, groupKey, messages,
    noncePort: memoryNoncePort()
  });
  const gapChunks = await collect(encodeFramedSyncStream(fresh));
  new DataView(gapChunks[3]!.buffer, gapChunks[3]!.byteOffset, gapChunks[3]!.byteLength)
    .setBigUint64(4, 5n);
  const gap = await source(gapChunks);
  await expect(decodeDesktopFramedSyncSession({
    authenticatedContext: context, authorDeviceId: 'device-a', groupKey, ...gap
  })).rejects.toThrow('frame_sequence_not_contiguous');
});

it('does not encrypt when durable nonce persistence fails', async () => {
  const noncePort: FramedSyncSessionNoncePort = {
    abandon: async () => undefined,
    persistBeforeEncryption: async () => { throw new Error('durable_write_failed'); }
  };
  await expect(encodeDesktopFramedSyncSession({
    authenticatedContext: context, groupKey, messages, noncePort
  })).rejects.toThrow('durable_write_failed');
});
