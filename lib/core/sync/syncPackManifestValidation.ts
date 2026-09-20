import type { DbPort } from './dbPort.js';
import { SYNC_PACK_TABLE_NAMES } from './syncPackManifest.js';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_sync_pack_manifest');
  return value as Record<string, unknown>;
}

function sequence(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('invalid_sync_pack_manifest_field');
  }
  return value;
}

export function parseSyncPackManifest(value: unknown) {
  const manifest = record(value);
  if (typeof manifest.pack_id !== 'string' || !manifest.pack_id.trim()) throw new Error('invalid_sync_pack_manifest_field');
  const fromStateSeq = sequence(manifest.from_state_seq);
  const toStateSeq = sequence(manifest.to_state_seq);
  if (toStateSeq < fromStateSeq) throw new Error('invalid_sync_pack_manifest_field');
  const tables = parseTables(manifest.tables);
  return { packId: manifest.pack_id.trim(), fromStateSeq, toStateSeq, tables };
}

function parseTables(value: unknown) {
  if (!Array.isArray(value)) throw new Error('invalid_sync_pack_table_manifest');
  const counts = new Map<string, number>();
  for (const item of value) {
    const table = record(item);
    const name = table.name;
    if (typeof name !== 'string' || !SYNC_PACK_TABLE_NAMES.some((known) => known === name) || counts.has(name)) {
      throw new Error('invalid_sync_pack_table_manifest');
    }
    counts.set(name, sequence(table.row_count));
  }
  if (counts.size !== SYNC_PACK_TABLE_NAMES.length) throw new Error('invalid_sync_pack_table_manifest');
  return SYNC_PACK_TABLE_NAMES.map((name) => ({ name, rowCount: counts.get(name)! }));
}

export async function assertSyncPackManifestMatchesDatabase(
  port: DbPort,
  expected: ReturnType<typeof parseSyncPackManifest>
) {
  const rows = await port.query<{ value: string }>(
    "SELECT value FROM inc.pack_manifest WHERE key = 'manifest_json'"
  );
  if (rows.length !== 1) throw new Error('missing_sync_pack_inner_manifest');
  const actual = parseSyncPackManifest(JSON.parse(rows[0]!.value));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('sync_pack_inner_manifest_mismatch');
  for (const table of actual.tables) {
    const [row] = await port.query<{ count: number }>(`SELECT COUNT(*) AS count FROM inc."${table.name}"`);
    if (row?.count !== table.rowCount) throw new Error(`invalid_sync_pack_row_count:${table.name}`);
  }
}
