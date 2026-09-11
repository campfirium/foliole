import { expect, it } from 'vitest';

import type { DbParams, DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort';

import { rekeyNodeObject } from './companionSyncNodeRekey';

it('creates a canonical branch head without rewriting shared version history', async () => {
  const port = new RecordingPort();

  await rekeyNodeObject(
    port, 'highlight-1', 'highlight-1~canonical', 'android#1', 'ver_canonical'
  );

  expect(port.runs.some(([sql, params]) => sql.startsWith('INSERT INTO node_sync_versions (')
    && params[0] === 'ver_canonical'
    && params[1] === 'highlight-1~canonical'
    && params.at(-1) === JSON.stringify({ id: 'highlight-1~canonical', title: 'Selection' })))
    .toBe(true);
  expect(port.runs.some(([sql]) => sql.startsWith('UPDATE node_sync_versions SET'))).toBe(false);
  expect(port.runs.some(([sql]) => sql.includes('json_'))).toBe(false);
  expect(port.runs.at(-1)).toEqual([
    'DELETE FROM nodes WHERE id = ?',
    ['highlight-1']
  ]);
});

it('moves a preserved source version onto the canonical object', async () => {
  const port = new RecordingPort();

  await rekeyNodeObject(
    port, 'highlight-1', 'highlight-1~canonical', 'android#1', 'android#1'
  );

  expect(port.runs.some(([sql, params]) => sql.startsWith('UPDATE node_sync_versions SET')
    && params[0] === 'highlight-1~canonical'
    && params[1] === JSON.stringify({ id: 'highlight-1~canonical', title: 'Selection' })
    && params[2] === 'android#1')).toBe(true);
  expect(port.runs.some(([sql]) => sql.startsWith('INSERT INTO node_sync_versions ('))).toBe(false);
});

class RecordingPort implements DbPort {
  readonly runs: Array<[string, DbParams]> = [];

  async query<T extends DbRow = DbRow>(sql: string) {
    if (sql === 'PRAGMA table_info(nodes)') {
      return [{ name: 'id' }, { name: 'title' }] as unknown as T[];
    }
    if (sql.startsWith('SELECT host_name, created_at')) {
      return [{
        body_text: 'Selection',
        content_hash: 'hash-1',
        created_at: '2026-09-09T00:00:00.000Z',
        host_name: 'A5',
        snapshot_json: JSON.stringify({ id: 'highlight-1', title: 'Selection' }),
      }] as unknown as T[];
    }
    return [];
  }

  async run(sql: string, params: DbParams = []) {
    this.runs.push([sql, params]);
    return { changes: 1, lastInsertRowId: null };
  }

  async transaction<T>(execute: (tx: DbPort) => Promise<T>): Promise<T> {
    return execute(this);
  }
}
