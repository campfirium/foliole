import Database from 'better-sqlite3';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

export const time = '2026-10-07T01:00:00.000Z';
export const body = '\ufeff中文😀\0' + '中😀'.repeat(100_000);

/** Reproduce native numbered SQLite binding for the unchanged legacy query used as a comparison. */
function numberedQueryPort(source: DbPort): DbPort {
  return { ...source, query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
    if (!/\?\d+/u.test(sql)) return source.query<T>(sql, params);
    const expanded: Array<DbParams[number]> = [];
    const positional = sql.replace(/\?(\d+)/gu, (_match, index: string) => {
      expanded.push(params[Number(index) - 1]!);
      return '?';
    });
    return source.query<T>(positional, expanded);
  } };
}

export function pendingCountFixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  db.prepare('INSERT INTO companion_meta VALUES (?, ?, ?)').run('host_name', 'phone', time);
  db.prepare('INSERT INTO nodes (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('node', 'Node', body, time, time);
  for (let index = 1; index <= 3; index++) {
    const content = index === 1 ? body : null;
    db.prepare(`INSERT INTO node_sync_versions
      (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, 'node', ?, ?, ?, ?, ?)`)
      .run(`v${index}`, index === 2 ? 'other-host' : 'phone', time, '4'.repeat(64), content,
        JSON.stringify({ id: 'node', kind: 'topic', title: 'Node', content, updated_at: time }));
  }
  db.prepare(`INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash,
    last_modified_by_host_name, updated_at, sync_dirty) VALUES ('node_open_state', 'node', 7, ?, 'phone', ?, 1)`)
    .run('5'.repeat(64), time);
  db.prepare(`INSERT INTO review_log VALUES ('review', 'review-op', 'phone', 'node', 1, 'v1', ?, ?, 0, 0, ?, 0, 0)`)
    .run(time, time, time);
  const port = numberedQueryPort(createBetterSqliteDbPort(db)), queries: string[] = [];
  const metadataPort: DbPort = { ...port, async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
    queries.push(sql);
    return port.query<T>(sql, params);
  } };
  return { db, port, metadataPort, queries,
    receipt(stream: string, operation: string, status: string, peer = 'peer') {
      db.prepare(`INSERT INTO sync_delivery_receipts (peer_id, stream_name, operation_id, object_type,
        object_id, payload_identity, status, created_at, updated_at) VALUES (?, ?, ?, 'node', 'node', '', ?, ?, ?)`)
        .run(peer, stream, operation, status, time, time);
    }
  };
}
