import type BetterSqlite3 from 'better-sqlite3';

export function seedNodeVersion(sqlite: BetterSqlite3.Database, nodeId: string, versionId: string) {
  const node = sqlite.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId) as Record<string, unknown>;
  sqlite.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES (?, ?, NULL, 'fixture-host', ?, ?, ?, ?) ON CONFLICT(version_id) DO NOTHING`)
    .run(versionId, nodeId, node.created_at, `fixture:${versionId}`, node.content, JSON.stringify(node));
}
