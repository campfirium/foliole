import { expect, it } from 'vitest';

import type { DbParams, DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort';

import { rekeyNodeObject } from './companionSyncNodeRekey';

it('rekeys version snapshots without requiring SQLite JSON functions', async () => {
  const port = new RecordingPort();

  await rekeyNodeObject(port, 'highlight-1', 'highlight-1~canonical');

  expect(port.runs).toContainEqual([
    'UPDATE node_sync_versions SET snapshot_json = ? WHERE version_id = ?',
    [JSON.stringify({ id: 'highlight-1~canonical', title: 'Selection' }), 'android#1']
  ]);
  expect(port.runs.some(([sql]) => sql.includes('json_'))).toBe(false);
  expect(port.runs.at(-1)).toEqual([
    'DELETE FROM nodes WHERE id = ?',
    ['highlight-1']
  ]);
});

class RecordingPort implements DbPort {
  readonly runs: Array<[string, DbParams]> = [];

  async query<T extends DbRow = DbRow>(sql: string) {
    if (sql === 'PRAGMA table_info(nodes)') {
      return [{ name: 'id' }, { name: 'title' }] as unknown as T[];
    }
    if (sql.startsWith('SELECT version_id, snapshot_json')) {
      return [{
        snapshot_json: JSON.stringify({ id: 'highlight-1', title: 'Selection' }),
        version_id: 'android#1'
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
