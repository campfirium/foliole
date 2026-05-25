export function numberValue(value) {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export function getNumber(db, sql, params = []) {
  const row = db.prepare(sql).get(...params);
  const value = row ? Object.values(row)[0] : 0;
  return numberValue(value);
}

export function tableExists(db, tableName) {
  return (
    getNumber(db, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?", [
      tableName
    ]) > 0
  );
}

export function safeSection(db, tableName, reader, fallback) {
  return tableExists(db, tableName) ? reader() : fallback;
}

export function estimateTablePayloadBytes(db, tableName) {
  if (!tableExists(db, tableName)) {
    return 0;
  }
  const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all();
  const expression =
    columns
      .map((column) => column.name)
      .filter((name) => name && name !== 'id')
      .map((name) => `COALESCE(length("${name}"), 0)`)
      .join(' + ') || '0';
  return getNumber(db, `SELECT COALESCE(SUM(${expression}), 0) FROM "${tableName}"`);
}
