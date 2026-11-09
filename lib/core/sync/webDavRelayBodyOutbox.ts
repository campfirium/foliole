import { z } from 'zod';

import { attachmentBlockResourceSchema } from './attachmentBlockReceiver.js';
import type { DbPort } from './dbPort.js';
import { encodeFramedSyncStream, type FramedSyncStreamBody } from './framedSyncBinaryStream.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { compareFramedSyncInventories } from './framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from './framedSyncInventoryRead.js';
import { loadNodeOwnedArticleResourceNeeds } from './nodeOwnedArticleResourceNeeds.js';
import { REQUEST_SYNC_BATCH_OBJECTS } from './requestSyncBatchContract.js';
import { requestSyncBatchMessages, withRequestSyncBatchSnapshot } from './requestSyncBatchSnapshot.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { prepareRequestSyncWire } from './requestSyncWire.js';
import { WEB_DAV_ATTACHMENT_SUFFIX } from './webDavRelayAttachmentWire.js';
import type { WebDavRelayBodyScope } from './webDavRelayBodyScope.js';

export const webDavRelayPacketSchema = z.object({
  name: z.string().regex(/^\d{8}T\d{6}\.\d{3}Z-[a-f0-9-]{36}(?:\.asset)?\.bin$/u),
  chunks: z.number().int().positive(),
  bytes: z.number().int().positive(),
  through: z.number().int().positive(),
  attachments: z.array(attachmentBlockResourceSchema.shape.storageKey).optional()
});
const outboxSchema = z.object({ sequence: z.number().int().nonnegative(), packet: webDavRelayPacketSchema.nullable() });
type Packet = z.infer<typeof webDavRelayPacketSchema>;
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
  includeAttachments?: boolean;
  signal?: AbortSignal;
};

export function freezeWebDavRelayBodyPacket(input: FreezeInput) {
  return input.host.readSnapshot(async db => {
    const rows = await db.query<{ node_id: string; state_seq: number; op_id: string | null }>(`
      SELECT object_id AS node_id, state_seq, NULL AS op_id
      FROM sync_object_state WHERE object_type = 'node' AND state_seq > ? AND state_seq <= ?
      UNION ALL
      SELECT review.node_id, position.state_seq, review.op_id
      FROM webdav_relay_review_sequence position JOIN review_log review ON review.op_id = position.op_id
      WHERE position.state_seq > ? AND position.state_seq <= ?
      ORDER BY state_seq LIMIT ?`, [input.sequence, input.upper, input.sequence, input.upper, REQUEST_SYNC_BATCH_OBJECTS]);
    if (!rows.length) return null;
    const candidates = collectCandidates(rows);
    const selections = candidates.map(candidate => ({ objectType: 'node', globalId: candidate.nodeId,
      requestId: crypto.getRandomValues(new Uint8Array(16)),
      resolve: () => selectChanges(db, candidate) }));
    return withRequestSyncBatchSnapshot({ ...input.host, readSnapshot: read => read(db) }, selections,
      input.signal, async objects => {
        for (const object of objects) if (object.kind === 'error') throw new Error(object.result.error);
        // A group can contain later rows. Stop before the first group that did not fit.
        const next = candidates[objects.length];
        const through = next ? next.firstSequence - 1 : rows[rows.length - 1]!.state_seq;
        const ids = candidates.slice(0, objects.length).filter(candidate => candidate.body).map(candidate => candidate.nodeId);
        const attachments = input.includeAttachments && ids.length
          ? (await loadNodeOwnedArticleResourceNeeds(db, ids)).needs.map(need => need.storageKey) : [];
        const packet = await writePacket(input, objects);
        return { ...packet, through, ...(attachments.length ? { attachments } : {}) };
      });
  }, input.signal);
}

type Candidate = { nodeId: string; firstSequence: number; body: boolean; reviewIds: string[] };

function collectCandidates(rows: readonly { node_id: string; state_seq: number; op_id: string | null }[]) {
  const candidates = new Map<string, Candidate>();
  for (const row of rows) {
    const candidate = candidates.get(row.node_id) ?? {
      nodeId: row.node_id, firstSequence: row.state_seq, body: false, reviewIds: []
    };
    if (row.op_id === null) candidate.body = true;
    else candidate.reviewIds.push(row.op_id);
    candidates.set(row.node_id, candidate);
  }
  return [...candidates.values()];
}

async function selectChanges(db: DbPort, candidate: Candidate) {
  const entry = await readFramedSyncInventoryEntry(db, { objectType: 'node', globalId: candidate.nodeId });
  if (!entry || entry.unready) throw new Error('webdav_relay_body_unavailable');
  const [difference] = compareFramedSyncInventories({ local: [entry], remote: [] });
  if (!difference) throw new Error('webdav_relay_body_unavailable');
  const need = difference.need;
  return { ...difference, need: { ...need, reviewFactIds: candidate.reviewIds, resourceHashes: [],
    sharedState: candidate.body && need.sharedState,
    frontierFactIds: candidate.body ? need.frontierFactIds : [],
    requiredRelationIds: candidate.body ? need.requiredRelationIds : [],
    stateFactIds: candidate.body
      ? need.stateFactIds?.filter(value => value.startsWith('["node_text_alternative",')) ?? [] : [] } };
}

async function writePacket(input: FreezeInput, objects: Parameters<typeof requestSyncBatchMessages>[0]) {
  const requestId = crypto.getRandomValues(new Uint8Array(16));
  const wire = await prepareRequestSyncWire({ context: input.scope.send, groupKey: input.groupKey,
    ...(input.signal ? { signal: input.signal } : {}), messages: id => requestSyncBatchMessages(objects, id, requestId) });
  return stageWebDavRelayPacket(input.files, input.scope, wire);
}

export async function stageWebDavRelayPacket(files: FramedSyncFilePort, scope: WebDavRelayBodyScope,
  wire: FramedSyncStreamBody, suffix: '.bin' | typeof WEB_DAV_ATTACHMENT_SUFFIX = '.bin') {
  const directory = webDavRelayPacketDirectory(scope);
  // The caller holds the slot exclusively, and has checked that no pending packet references it.
  await files.remove(directory);
  let bytes = 0;
  let chunks = 0;
  for await (const chunk of encodeFramedSyncStream(wire)) {
    await files.write(`${directory}/${chunks++}`, chunk);
    bytes += chunk.length;
  }
  const time = new Date().toISOString().replace(/[:-]/gu, '');
  return { name: `${time}-${crypto.randomUUID()}${suffix}`, chunks, bytes };
}

export function webDavRelayPacketBytes(files: FramedSyncFilePort, scope: WebDavRelayBodyScope, packet: Pick<Packet, 'bytes' | 'chunks'>) {
  const directory = webDavRelayPacketDirectory(scope);
  return { bytes: packet.bytes, fileRange: { directory, count: packet.chunks }, async *chunks() {
    for (let index = 0; index < packet.chunks; index++) {
      const chunk = await files.read(`${directory}/${index}`);
      if (!chunk) throw new Error('webdav_relay_pending_bytes_missing');
      yield chunk;
    }
  } };
}
