import type Database from 'better-sqlite3';

import { ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS as definitions } from '../../lib/core/sync/androidSyncPackProviderDefinitions.js';

export function copyPayloads(pack: Database.Database) {
  const payloads = new Map<string, Record<string, unknown>>();
  for (const plan of definitions.payloadPlans) {
    for (const row of pack.prepare(plan.sql).all() as Array<Record<string, unknown>>) {
      const objectId = String(row.__object_id);
      delete row.__object_id;
      payloads.set(`${plan.objectType}\u0000${objectId}`, nestedPayload(row));
    }
  }
  const states = pack.prepare(`SELECT object_type, object_id, content_hash, updated_at, deleted_at
    FROM sync_object_state WHERE object_type NOT IN ('external_document','node')`).all() as Array<Record<string, unknown>>;
  const insert = pack.prepare(`INSERT INTO sync_objects
    (object_type, object_id, content_hash, payload_json, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const state of states) {
    const row = state.deleted_at == null ? payloads.get(`${state.object_type}\u0000${state.object_id}`) : null;
    if (state.deleted_at == null && row === undefined) continue;
    insert.run(state.object_type, state.object_id, state.content_hash,
      row ? JSON.stringify(row) : null, state.updated_at, state.deleted_at);
  }
}

function nestedPayload(row: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const [parent = '', child] = key.split('__');
    if (!child) payload[parent] = value;
    else {
      const nested = (payload[parent] ??= {}) as Record<string, unknown>;
      nested[child] = value;
    }
  }
  return payload;
}
