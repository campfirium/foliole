function tableExists(database, table) {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(table) !== undefined;
}

export function dirtyObjectCounts(database) {
  if (!tableExists(database, 'sync_object_state')) return {};
  const statement = database.prepare(`SELECT object_type, COUNT(*) AS count
    FROM sync_object_state WHERE sync_dirty = 1 AND object_type <> 'view_state'
    GROUP BY object_type ORDER BY object_type`);
  if (typeof statement.all !== 'function') return {};
  return Object.fromEntries(statement.all().map((row) => [row.object_type, Number(row.count)]));
}

export function dirtySettingStates(database) {
  if (!tableExists(database, 'sync_object_state')) return [];
  const statement = database.prepare(`SELECT object_id, content_hash, base_content_hash FROM sync_object_state
    WHERE sync_dirty = 1 AND object_type = 'setting' ORDER BY object_id LIMIT 8`);
  if (typeof statement.all !== 'function') return [];
  return statement.all();
}
