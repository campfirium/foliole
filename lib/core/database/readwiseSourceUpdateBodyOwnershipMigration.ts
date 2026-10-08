import { isBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';

import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { hashTextBody } from './textBodyHash.js';

const NEXT = `SELECT source_fingerprint, remote_import_state_json FROM import_sources
  WHERE source_fingerprint > ? AND remote_provider = 'readwise' AND json_valid(remote_import_state_json)
    AND json_extract(remote_import_state_json, '$.sourceUpdate.status') = 'pending'
  ORDER BY source_fingerprint LIMIT 1`;
const BODY = `SELECT data.data, blob.kind, blob.compression, blob.original_size_bytes, blob.stored_size_bytes
  FROM content_blob_data data JOIN content_blobs blob ON blob.hash = data.hash WHERE data.hash = ?`;
const STORE = 'UPDATE import_sources SET remote_import_state_json = ? WHERE source_fingerprint = ?';
const sourceSchema = z.object({ source_fingerprint: z.string(), remote_import_state_json: z.string() });
const stateSchema = z.object({ sourceUpdate: z.object({ content: z.string().optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u) }).passthrough() }).passthrough();
const bodySchema = z.object({ data: z.custom<Uint8Array>(isBytes), kind: z.string(), compression: z.string(),
  original_size_bytes: z.number().int().nonnegative(), stored_size_bytes: z.number().int().nonnegative() });
type Source = z.infer<typeof sourceSchema>;
type Body = z.infer<typeof bodySchema>;

function legacyHash(row: Source) {
  const state = stateSchema.parse(JSON.parse(row.remote_import_state_json));
  return typeof state.sourceUpdate.content === 'string' ? null : state.sourceUpdate.contentHash;
}

function ownedState(row: Source, body?: Body) {
  const state = stateSchema.parse(JSON.parse(row.remote_import_state_json));
  const update = state.sourceUpdate;
  const alreadyOwned = typeof update.content === 'string';
  if (typeof update.content !== 'string') {
    if (!body || !isBytes(body.data) || body.kind !== 'text_body' || body.compression !== 'none' ||
        body.original_size_bytes !== body.data.byteLength || body.stored_size_bytes !== body.data.byteLength) {
      throw new Error(`readwise_source_update_migration_unavailable:${row.source_fingerprint}`);
    }
    update.content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body.data);
  }
  if (hashTextBody(update.content) !== update.contentHash) {
    throw new Error(`readwise_source_update_migration_hash_mismatch:${row.source_fingerprint}`);
  }
  return alreadyOwned ? row.remote_import_state_json : JSON.stringify(state);
}

/** Preserve pending source text in its existing JSON owner during the schema transaction. */
export function migrateReadwiseSourceUpdateBodyOwnership(sqlite: DatabaseMigrationTarget) {
  let after = '';
  for (;;) {
    const raw = sqlite.prepare(NEXT).all(after)[0];
    if (!raw) return;
    const row = sourceSchema.parse(raw);
    after = row.source_fingerprint;
    const hash = legacyHash(row);
    const rawBody = hash ? sqlite.prepare(BODY).all(hash)[0] : undefined;
    const body = rawBody ? bodySchema.parse(rawBody) : undefined;
    sqlite.prepare(STORE).run(ownedState(row, body), after);
  }
}

export async function migrateCompanionReadwiseSourceUpdateBodyOwnership(db: DbPort) {
  let after = '';
  for (;;) {
    const [raw] = await db.query<Source>(NEXT, [after]);
    if (!raw) return;
    const row = sourceSchema.parse(raw);
    after = row.source_fingerprint;
    const hash = legacyHash(row);
    const [rawBody] = hash ? await db.query<Body>(BODY, [hash]) : [];
    const body = rawBody ? bodySchema.parse(rawBody) : undefined;
    await db.run(STORE, [ownedState(row, body), after]);
  }
}
