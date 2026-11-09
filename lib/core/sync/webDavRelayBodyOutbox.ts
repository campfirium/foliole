import { z } from 'zod';

import type { DbPort } from './dbPort.js';
import { encodeFramedSyncStream } from './framedSyncBinaryStream.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { compareFramedSyncInventories } from './framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from './framedSyncInventoryRead.js';
import { REQUEST_SYNC_BATCH_OBJECTS } from './requestSyncBatchContract.js';
import { requestSyncBatchMessages, withRequestSyncBatchSnapshot } from './requestSyncBatchSnapshot.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { prepareRequestSyncWire } from './requestSyncWire.js';
import type { WebDavRelayBodyScope } from './webDavRelayBodyScope.js';

const packetSchema = z.object({
  name: z.string().regex(/^\d{8}T\d{6}\.\d{3}Z-[a-f0-9-]{36}\.bin$/u),
  chunks: z.number().int().positive(),
  bytes: z.number().int().positive(),
  through: z.number().int().positive()
});
const outboxSchema = z.object({ sequence: z.number().int().nonnegative(), packet: packetSchema.nullable() });
type Packet = z.infer<typeof packetSchema>;
type Outbox = z.infer<typeof outboxSchema>;

function metadataKey(scope: WebDavRelayBodyScope) { return `${scope.key}:outbox`; }

export async function readWebDavRelayBodyOutbox(db: DbPort, scope: WebDavRelayBodyScope): Promise<Outbox> {
  const [row] = await db.query<{ value: string }>('SELECT value FROM sync_group_metadata WHERE key = ?', [metadataKey(scope)]);
  return row ? outboxSchema.parse(JSON.parse(row.value)) : { sequence: scope.baseline.sequence, packet: null };
}

export async function writeWebDavRelayBodyOutbox(db: DbPort, scope: WebDavRelayBodyScope, state: Outbox) {
  await db.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  [metadataKey(scope), JSON.stringify(state), new Date().toISOString()]);
}

export function webDavRelayPacketDirectory(scope: WebDavRelayBodyScope) {
  return `webdav-relay/${scope.key.split(':').slice(1).join('-')}`;
}

type FreezeInput = {
  host: RequestSyncDatabaseHost;
  files: FramedSyncFilePort;
  groupKey: Uint8Array;
  scope: WebDavRelayBodyScope;
  sequence: number;
  upper: number;
  signal?: AbortSignal;
};

export function freezeWebDavRelayBodyPacket(input: FreezeInput) {
  return input.host.readSnapshot(async db => {
    const candidates = await db.query<{ object_id: string; state_seq: number }>(`SELECT object_id, state_seq
      FROM sync_object_state WHERE object_type = 'node' AND state_seq > ? AND state_seq <= ?
      ORDER BY state_seq LIMIT ?`, [input.sequence, input.upper, REQUEST_SYNC_BATCH_OBJECTS]);
    if (!candidates.length) return null;
    const selections = candidates.map(row => ({ objectType: 'node', globalId: row.object_id,
      requestId: crypto.getRandomValues(new Uint8Array(16)),
      resolve: () => selectBody(db, row.object_id) }));
    return withRequestSyncBatchSnapshot({ ...input.host, readSnapshot: read => read(db) }, selections,
      input.signal, async objects => {
        for (const object of objects) if (object.kind === 'error') throw new Error(object.result.error);
        return writePacket(input, candidates[objects.length - 1]!.state_seq, objects);
      });
  }, input.signal);
}

async function selectBody(db: DbPort, id: string) {
  const entry = await readFramedSyncInventoryEntry(db, { objectType: 'node', globalId: id });
  if (!entry || entry.unready) throw new Error('webdav_relay_body_unavailable');
  const [difference] = compareFramedSyncInventories({ local: [entry], remote: [] });
  if (!difference) throw new Error('webdav_relay_body_unavailable');
  return { ...difference, need: { ...difference.need, reviewFactIds: [], resourceHashes: [],
    stateFactIds: difference.need.stateFactIds?.filter(value => value.startsWith('["node_text_alternative",')) ?? [] } };
}

async function writePacket(input: FreezeInput, through: number, objects: Parameters<typeof requestSyncBatchMessages>[0]) {
  const requestId = crypto.getRandomValues(new Uint8Array(16));
  const wire = await prepareRequestSyncWire({ context: input.scope.send, groupKey: input.groupKey,
    ...(input.signal ? { signal: input.signal } : {}), messages: id => requestSyncBatchMessages(objects, id, requestId) });
  const directory = webDavRelayPacketDirectory(input.scope);
  // The caller holds the slot exclusively, and has checked that no pending packet references it.
  await input.files.remove(directory);
  let bytes = 0;
  let chunks = 0;
  for await (const chunk of encodeFramedSyncStream(wire)) {
    await input.files.write(`${directory}/${chunks++}`, chunk);
    bytes += chunk.length;
  }
  const time = new Date().toISOString().replace(/[:-]/gu, '');
  return { name: `${time}-${crypto.randomUUID()}.bin`, through, chunks, bytes };
}

export function webDavRelayPacketBytes(files: FramedSyncFilePort, scope: WebDavRelayBodyScope, packet: Packet) {
  const directory = webDavRelayPacketDirectory(scope);
  return { bytes: packet.bytes, fileRange: { directory, count: packet.chunks }, async *chunks() {
    for (let index = 0; index < packet.chunks; index++) {
      const chunk = await files.read(`${directory}/${index}`);
      if (!chunk) throw new Error('webdav_relay_pending_bytes_missing');
      yield chunk;
    }
  } };
}
