import { hashTextBody } from './contentBodyBlobs.js';
import type { DatabaseDriver } from './driver.js';

// Explicit library holders rechecked in the collection write transaction.
const TEXT_HOLDERS = [
  ['nodes', 'content'], ['external_documents', 'content'], ['node_sync_versions', 'body_text'],
  ['node_text_alternatives', 'body_text'], ['keep_import_item_cache', 'content'],
  ['incoming_updates', 'updated_content']
] as const;
const JSON_HOLDERS = [
  ['node_sync_versions', 'snapshot_json'], ['node_sync_tombstones', 'snapshot_json'],
  ['node_sync_conflicts', 'snapshot_json'], ['nodes', 'resource_references'], ['nodes', 'image_sources'],
  ['external_documents', 'reference_json'], ['import_sources', 'remote_import_state_json'],
  ['import_sources', 'remote_annotations_json'], ['sync_change_log', 'payload_json'],
  ['editor_operation_history', 'payload_json'], ['sync_pack_dependency_rows', 'payload_json'],
  ['sync_pack_known_fact_claims', 'fact_json'], ['sync_group_restore_page_rows', 'payload_json'],
  ['readwise_api_import_stage', 'payload_json'], ['readwise_api_reconcile_stage', 'payload_json']
] as const;

function addTextReferences(held: Set<string>, value: string) {
  held.add(hashTextBody(value));
  for (const hash of value.match(/[a-f0-9]{64}/g) ?? []) held.add(hash);
}

function addJsonReferences(held: Set<string>, value: unknown) {
  if (typeof value === 'string') addTextReferences(held, value);
  else if (Array.isArray(value)) for (const child of value) addJsonReferences(held, child);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      addTextReferences(held, key);
      addJsonReferences(held, child);
    }
  }
}

function loadHeldBodyHashes(driver: DatabaseDriver) {
  const held = new Set(driver.queryAll<{ hash: string }>(
    `SELECT body_blob_hash AS hash FROM nodes WHERE body_blob_hash IS NOT NULL
     UNION SELECT body_blob_hash FROM external_documents WHERE body_blob_hash IS NOT NULL
     UNION SELECT content_hash FROM external_documents`).map((row) => row.hash));
  for (const [table, column] of TEXT_HOLDERS) {
    for (const row of driver.queryAll<{ value: string }>(
      `SELECT ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`)) {
      addTextReferences(held, row.value);
    }
  }
  for (const [table, column] of JSON_HOLDERS) {
    for (const row of driver.queryAll<{ value: string }>(
      `SELECT ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`)) {
      addJsonReferences(held, JSON.parse(row.value));
    }
  }
  return held;
}

/** Only caller-selected candidates are considered; malformed holder facts abort the transaction. */
export function collectTextBodyBlobCandidates(driver: DatabaseDriver, hashes: readonly string[]) {
  return driver.transaction(() => {
    const held = loadHeldBodyHashes(driver);
    const deletedHashes: string[] = [];
    let deletedBytes = 0;
    for (const hash of new Set(hashes)) {
      if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('text_body_collection_invalid_hash');
      if (held.has(hash)) continue;
      const row = driver.queryOne<{ kind: string; data: Uint8Array }>(
        `SELECT b.kind, data.data FROM content_blobs b
         JOIN content_blob_data data ON data.hash = b.hash WHERE b.hash = ?`, [hash]);
      if (!row || row.kind !== 'text_body') continue;
      if (hashTextBody(Buffer.from(row.data).toString('utf8')) !== hash) {
        throw new Error(`text_body_collection_invalid_bytes:${hash}`);
      }
      driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [hash]);
      driver.execute("DELETE FROM content_blobs WHERE hash = ? AND kind = 'text_body'", [hash]);
      deletedHashes.push(hash);
      deletedBytes += row.data.byteLength;
    }
    return { deletedHashes, deletedBytes };
  });
}
