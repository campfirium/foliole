import { createHash } from 'node:crypto';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function readStructureSummary(sqlite) {
  const objects = sqlite.prepare(`SELECT type, name, tbl_name AS tableName, sql
    FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'
    ORDER BY type, name`).all().map((row) => ({
    ...row,
    sql: row.sql?.replace(/\s+/g, ' ').trim() ?? null
  }));
  return { objectCount: objects.length, sha256: sha256(JSON.stringify(objects)) };
}

export function readBusinessSentinels(sqlite) {
  return {
    content: sqlite.prepare(`SELECT id, parent_id AS parentId, kind, title, content
      FROM nodes WHERE id LIKE 't166-%' ORDER BY id`).all(),
    reading: sqlite.prepare(`SELECT node_id AS nodeId, interval_duration_ms AS intervalDurationMs,
      interval_growth_factor AS intervalGrowthFactor, repetition_count AS repetitionCount, state
      FROM node_reading WHERE node_id = 't166-child'`).get(),
    review: sqlite.prepare(`SELECT node_id AS nodeId, state, stability, difficulty,
      scheduled_days AS scheduledDays, reps, lapses FROM node_review WHERE node_id = 't166-child'`).get(),
    settings: sqlite.prepare(`SELECT key, value FROM settings WHERE key = 't166.fixture.preference'`).get(),
    syncIdentity: sqlite.prepare(`SELECT peer_id AS peerId, status, last_seen_version_cursor AS cursor
      FROM sync_peers WHERE peer_id = 't166-peer'`).get()
  };
}
