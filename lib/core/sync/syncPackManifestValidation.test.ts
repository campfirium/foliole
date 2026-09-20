import { expect, it, vi } from 'vitest';

import type { DbPort } from './dbPort.js';
import { SYNC_PACK_TABLE_NAMES } from './syncPackManifest.js';
import { assertSyncPackManifestMatchesDatabase, parseSyncPackManifest } from './syncPackManifestValidation.js';

function manifest() {
  return { pack_id: 'pack', from_state_seq: 0, to_state_seq: 4,
    tables: SYNC_PACK_TABLE_NAMES.map((name) => ({ name, row_count: 0 })) };
}

it.each([-1, 0.5, '4', null, Number.MAX_SAFE_INTEGER + 1])('rejects invalid frontier %j without coercion', (value) => {
  expect(() => parseSyncPackManifest({ ...manifest(), to_state_seq: value })).toThrow('invalid_sync_pack_manifest_field');
});

it('rejects backward ranges and missing or duplicate table declarations', () => {
  expect(() => parseSyncPackManifest({ ...manifest(), from_state_seq: 5 })).toThrow();
  const input = manifest();
  expect(() => parseSyncPackManifest({ ...input, tables: input.tables.slice(1) })).toThrow();
  expect(() => parseSyncPackManifest({ ...input, tables: [...input.tables, input.tables[0]] })).toThrow();
});

it('compares manifests independently of table ordering and checks real row counts', async () => {
  const inner = manifest();
  inner.tables.reverse();
  const query = vi.fn(async (sql: string) => sql.includes('pack_manifest')
    ? [{ value: JSON.stringify(inner) }] : [{ count: 0 }]);
  const port = { query } as unknown as DbPort;
  const expected = parseSyncPackManifest(manifest());
  await expect(assertSyncPackManifestMatchesDatabase(port, expected)).resolves.toBeUndefined();
  query.mockImplementation(async (sql) => sql.includes('pack_manifest')
    ? [{ value: JSON.stringify(inner) }] : [{ count: 1 }]);
  await expect(assertSyncPackManifestMatchesDatabase(port, expected)).rejects.toThrow('invalid_sync_pack_row_count:sync_groups');
});
