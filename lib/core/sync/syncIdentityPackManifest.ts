import type { DbPort, DbRow } from './dbPort.js';
import { syncIdentityFingerprint, type SyncIdentityState } from './syncIdentityDigest.js';
import { syncIdentityFactChunkSchema, syncIdentityFactTailSchema } from './syncIdentityFactTransfer.js';
import { compareSyncIdentityText } from './syncIdentityKeyOrder.js';
import { parseSyncIdentityPackPage } from './syncIdentityPackPage.js';
import { SYNC_PACK_COMPRESSION, SYNC_PACK_DATABASE_ENTRY,
  SYNC_PACK_FORMAT, SYNC_PACK_PAYLOAD_SCHEMA_VERSION } from './syncPackEnvelopeContract.js';
import { SYNC_PACK_TABLE_NAMES } from './syncPackManifest.js';

export const SYNC_IDENTITY_PACK_FORMAT_VERSION = 21;
const hex = /^[a-f0-9]{64}$/u;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('sync_identity_pack_manifest_invalid');
  }
  return value as Record<string, unknown>;
}

function tables(value: unknown) {
  if (!Array.isArray(value) || value.length !== SYNC_PACK_TABLE_NAMES.length) {
    throw new Error('sync_identity_pack_tables_invalid');
  }
  return SYNC_PACK_TABLE_NAMES.map((name, index) => {
    const row = record(value[index]);
    if (row.name !== name || !Number.isSafeInteger(row.row_count) ||
        (row.row_count as number) < 0) throw new Error('sync_identity_pack_tables_invalid');
    return { name, row_count: row.row_count as number };
  });
}

function dependencies(value: unknown, page: ReturnType<typeof parseSyncIdentityPackPage>) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 128 ||
      new TextEncoder().encode(JSON.stringify(value)).length > 65536) {
    throw new Error('sync_identity_pack_dependencies_invalid');
  }
  const selected = new Set(page.objects.map((item) => `${item.object_type}\0${item.object_id}`));
  let previous = '';
  return value.map((item) => {
    const row = record(item);
    if (Object.keys(row).length !== 3 || row.object_type !== 'node' ||
        typeof row.object_id !== 'string' || !row.object_id || row.object_id.length > 2048 ||
        compareSyncIdentityText(row.object_id, previous) <= 0 ||
        selected.has(`node\0${row.object_id}`) ||
        typeof row.fingerprint !== 'string' || !hex.test(row.fingerprint)) {
      throw new Error('sync_identity_pack_dependencies_invalid');
    }
    previous = row.object_id;
    return { object_type: 'node' as const, object_id: row.object_id, fingerprint: row.fingerprint };
  });
}

export function parseSyncIdentityPackInnerManifest(value: unknown) {
  const manifest = record(value);
  if (['from_state_seq', 'to_state_seq', 'frontier_state_seq'].some((field) =>
    field in manifest)) throw new Error('sync_identity_pack_sequence_forbidden');
  const identityPage = parseSyncIdentityPackPage(manifest.identity_page);
  if (manifest.contract !== 'global-id-v1' ||
      typeof manifest.pack_id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(manifest.pack_id)) {
    throw new Error('sync_identity_pack_manifest_invalid');
  }
  const needsTail = identityPage.facts !== undefined && identityPage.facts.section !== 'head';
  if (needsTail !== (manifest.fact_tail !== undefined)) throw new Error('sync_identity_fact_tail_invalid');
  const chunk = manifest.fact_chunk === undefined ? undefined : syncIdentityFactChunkSchema.parse(manifest.fact_chunk);
  if (chunk && (!needsTail || !identityPage.facts?.chunk && chunk.offset !== 0 || identityPage.facts?.chunk &&
      JSON.stringify(chunk) !== JSON.stringify(identityPage.facts.chunk)) ||
      !chunk && (identityPage.facts?.chunk || needsTail &&
        syncIdentityFactTailSchema.parse(manifest.fact_tail).chunk)) {
    throw new Error('sync_identity_fact_chunk_invalid');
  }
  return { contract: 'global-id-v1' as const, pack_id: manifest.pack_id,
    ...(chunk ? { fact_chunk: chunk } : {}),
    ...(needsTail ? { fact_tail: syncIdentityFactTailSchema.parse(manifest.fact_tail) } : {}),
    identity_page: identityPage, dependencies: dependencies(manifest.dependencies, identityPage),
    tables: tables(manifest.tables) };
}

export function parseSyncIdentityPackContainerManifest(value: unknown, expected: {
  sourcePeerId: string; targetPeerId: string;
}) {
  const manifest = record(value);
  if (['from_state_seq', 'to_state_seq', 'frontier_state_seq'].some((field) =>
    field in manifest)) throw new Error('sync_identity_pack_sequence_forbidden');
  const inner = parseSyncIdentityPackInnerManifest(manifest);
  if (manifest.format !== SYNC_PACK_FORMAT ||
      manifest.format_version !== SYNC_IDENTITY_PACK_FORMAT_VERSION ||
      manifest.schema_version !== SYNC_PACK_PAYLOAD_SCHEMA_VERSION ||
      manifest.compression !== SYNC_PACK_COMPRESSION ||
      manifest.database_file !== SYNC_PACK_DATABASE_ENTRY ||
      manifest.from_peer_id !== expected.sourcePeerId ||
      manifest.to_peer_id !== expected.targetPeerId ||
      inner.identity_page.source_peer_id !== expected.sourcePeerId ||
      inner.identity_page.target_peer_id !== expected.targetPeerId ||
      !['database_uncompressed_sha256', 'database_compressed_sha256'].every((field) =>
        typeof manifest[field] === 'string' && /^sha256:[a-f0-9]{64}$/u.test(manifest[field] as string))) {
    throw new Error('sync_identity_pack_manifest_invalid');
  }
  return { ...inner, database_uncompressed_sha256: manifest.database_uncompressed_sha256 as string,
    database_compressed_sha256: manifest.database_compressed_sha256 as string };
}

export async function assertSyncIdentityPackInnerMatchesDatabase(port: DbPort,
  expected: ReturnType<typeof parseSyncIdentityPackContainerManifest>) {
  const rows = await port.query<{ value: string }>(
    "SELECT value FROM inc.pack_manifest WHERE key = 'manifest_json'");
  if (rows.length !== 1) throw new Error('sync_identity_pack_inner_manifest_missing');
  const actual = parseSyncIdentityPackInnerManifest(JSON.parse(rows[0]!.value));
  if (JSON.stringify(actual) !== JSON.stringify({ contract: expected.contract,
    pack_id: expected.pack_id,
    ...(expected.fact_chunk ? { fact_chunk: expected.fact_chunk } : {}),
    ...(expected.fact_tail ? { fact_tail: expected.fact_tail } : {}),
    identity_page: expected.identity_page, dependencies: expected.dependencies,
    tables: expected.tables })) throw new Error('sync_identity_pack_inner_manifest_mismatch');
  for (const table of expected.tables) {
    const [count] = await port.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM inc."${table.name}"`);
    if (count?.count !== table.row_count) throw new Error(`sync_identity_pack_row_count:${table.name}`);
  }
  const columns = await port.query<{ name: string }>('PRAGMA inc.table_info(sync_object_state)');
  if (!columns.some((column) => column.name === 'current_version_id')) {
    throw new Error('sync_identity_pack_state_head_missing');
  }
  const expectedObjects = [...expected.identity_page.objects, ...expected.dependencies];
  const [stateCount] = await port.query<{ count: number }>(
    'SELECT COUNT(*) AS count FROM inc.sync_object_state');
  if (stateCount?.count !== expectedObjects.length) {
    throw new Error('sync_identity_pack_state_scope_mismatch');
  }
  for (const object of expectedObjects) {
    const [state] = await port.query<SyncIdentityState & DbRow & { state_seq: number }>(
      `SELECT object_type, object_id, current_version_id, content_hash, deleted_at, state_seq
       FROM inc.sync_object_state WHERE object_type = ? AND object_id = ?`,
      [object.object_type, object.object_id]);
    if (!state || state.state_seq !== 0 || syncIdentityFingerprint(state) !== object.fingerprint) {
      throw new Error('sync_identity_pack_state_mismatch');
    }
  }
}
