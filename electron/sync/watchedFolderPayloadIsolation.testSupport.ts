import { hexToBytes } from '@noble/hashes/utils.js';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { framedSyncObjectStateFactId } from '../../lib/core/sync/framedSyncObjectStateInventory.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';
import { context, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';

type Payload = Record<string, string | number | boolean | null>;
type Kind = 'watched_folder' | 'import_source';
const at = '2026-05-01T00:00:00.000Z';

export function publish(peer: RestorePeer, type: Kind, id: string) {
  const { payload_json } = peer.sqlite.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE[type]).get(id) as { payload_json: string };
  const hash = computeSyncContentHash(type, JSON.parse(payload_json));
  peer.sqlite.prepare(`INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash, updated_at,
    last_modified_by_host_name, sync_dirty) VALUES (?, ?, (SELECT high_water + 1 FROM sync_state_sequence), ?, ?, 'remote', 0)
    ON CONFLICT(object_type, object_id) DO UPDATE SET content_hash = excluded.content_hash, updated_at = excluded.updated_at`)
    .run(type, id, hash, at);
  return JSON.parse(payload_json) as Payload;
}

export function state(peer: RestorePeer) {
  return ['desktop_sources', 'watched_folder_bindings', 'import_sources', 'sync_object_state',
    'node_version_local_source_revisions', 'node_version_device_revisions']
    .map(table => peer.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}

export async function withSnapshot(source: RestorePeer, target: RestorePeer, type: Kind, id: string,
  execute: (replay: (patch?: Payload) => Promise<unknown>, payload: Payload) => Promise<void>) {
  const local = await readRequestSyncInventorySnapshot(source.db);
  const owner = type === 'import_source' ? source.sqlite.prepare('SELECT latest_node_id FROM import_sources WHERE source_fingerprint = ?').pluck().get(id) : null;
  const difference = compareFramedSyncInventories({ local, remote: [] })
    .find(value => owner ? value.objectType === 'node' && value.globalId === owner : value.objectType === type && value.globalId === id);
  if (!difference) throw new Error('test_request_missing');
  await withRequestSyncFiles(source.host.files, async request => {
    const selected = await writeRequestSyncSnapshot(source.db, difference, request);
    const facts: CanonicalFact[] = [];
    for await (const value of request.readFacts()) facts.push(value);
    const original = facts.find(fact => fact.kind === 1 && (owner
      ? JSON.parse(fact.factId)[0] === type && JSON.parse(fact.factId)[1] === id
      : fact.objectType === type && fact.globalId === id));
    if (!original) throw new Error('test_state_fact_missing');
    const serialized = original.body.find(field => field.name === 'payload_json')?.value;
    if (serialized?.kind !== 'string') throw new Error('test_payload_missing');
    const payload = JSON.parse(serialized.value) as Payload;
    await execute(async patch => {
      const changed = { ...payload, ...patch };
      const hash = computeSyncContentHash(type, changed);
      const fact = !patch ? original : { ...original, sharedStateHash: hexToBytes(hash),
        factId: owner ? JSON.stringify([type, id, hash]) : framedSyncObjectStateFactId(type, hash), body: original.body.map(field => {
          const value = field.name === 'payload_json' ? JSON.stringify(changed) : field.name === 'content_hash' ? hash
            : field.name === 'updated_at' ? '2026-06-01T00:00:00.000Z' : null;
          return value === null ? field : { ...field, value: { kind: 'string' as const, value } };
        }) };
      return applyRequestSyncObject(target.db, {
        context: context({ groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
          providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }),
        peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
          library_epoch: source.epoch, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
        objectType: difference.objectType, globalId: difference.globalId, ...(selected.currentVersionId ? { currentVersionId: selected.currentVersionId } : {}),
        requestId: new Uint8Array(16), facts: async function* () {
          for (const candidate of facts) yield candidate === original ? fact : candidate;
        },
        loadBody: (_db, blob) => request.loadBody(blob)
      });
    }, payload);
  });
}
