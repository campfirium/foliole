import Database from 'better-sqlite3';

import { ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS as definitions } from '../../lib/core/sync/androidSyncPackProviderDefinitions.js';

export function copyPayloads(pack: Database.Database) {
  const payloads = new Map<string, Record<string, unknown>>();
  for (const plan of definitions.payloadPlans) {
    const sources = new Map<string, unknown[]>();
    if ('parentOrderSourcesSql' in plan) for (const value of pack.prepare(plan.parentOrderSourcesSql).all() as
      { parent_id: string; author_id: string; counter: number; child_ids_json: string }[]) {
      const values = sources.get(value.parent_id) ?? [];
      values.push({ authorId: value.author_id, counter: value.counter, childIds: JSON.parse(value.child_ids_json) });
      sources.set(value.parent_id, values);
    }
    for (const row of pack.prepare(plan.sql).all() as Array<Record<string, unknown>>) {
      const objectId = String(row.__object_id);
      delete row.__object_id;
      if ('parentOrderSourcesSql' in plan) row.sources_json = JSON.stringify(sources.get(objectId) ?? []);
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

export function buildProviderPack(sourcePath: string, fromStateSeq: number, toStateSeq = 3) {
  const pack = new Database(':memory:');
  for (const statement of definitions.packSchema) pack.exec(statement);
  pack.prepare('ATTACH DATABASE ? AS source').run(sourcePath);
  definitions.copyStatements.forEach((statement, index) => {
    if (index === definitions.stateCopyIndex) pack.prepare(statement).run(fromStateSeq, toStateSeq);
    else if (index === definitions.payloadCopyIndex) {
      copyPayloads(pack);
      pack.exec(statement);
    }
    else pack.exec(statement);
  });
  pack.exec('DETACH DATABASE source');
  return pack;
}
