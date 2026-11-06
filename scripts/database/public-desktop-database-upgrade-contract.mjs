function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function normalizeType(value) {
  return String(value ?? '').trim().toUpperCase();
}

function readColumns(sqlite, tableName) {
  return sqlite.prepare(`PRAGMA table_xinfo(${quoteIdentifier(tableName)})`).all().map((column) => ({
    hidden: Number(column.hidden),
    name: column.name,
    notNull: Number(column.notnull),
    primaryKey: Number(column.pk),
    type: normalizeType(column.type)
  }));
}

function readForeignKeys(sqlite, tableName) {
  return sqlite.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`).all().map((key) => ({
    from: key.from,
    match: key.match,
    onDelete: key.on_delete,
    onUpdate: key.on_update,
    sequence: Number(key.seq),
    table: key.table,
    to: key.to
  }));
}

function readIndexes(sqlite, schemaObjects) {
  return schemaObjects.filter((object) => object.type === 'index' && object.sql).map((index) => {
    const definition = sqlite.prepare(`PRAGMA index_list(${quoteIdentifier(index.tableName)})`).all()
      .find((candidate) => candidate.name === index.name);
    const columns = sqlite.prepare(`PRAGMA index_xinfo(${quoteIdentifier(index.name)})`).all()
      .filter((column) => Number(column.key) === 1)
      .map((column) => ({
        collation: column.coll,
        descending: Number(column.desc),
        name: column.name
      }));
    return { columns, name: index.name, tableName: index.tableName, unique: Number(definition?.unique) };
  });
}

export function readDatabaseCapabilities(sqlite) {
  const tableFlags = sqlite.prepare('PRAGMA table_list').all();
  const schemaObjects = sqlite.prepare(`SELECT type, name, tbl_name AS tableName, sql
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%' AND type IN ('index', 'table', 'trigger', 'view')
    ORDER BY type, name`).all();
  return {
    indexes: readIndexes(sqlite, schemaObjects),
    tables: schemaObjects.filter((object) => object.type === 'table').map((table) => ({
      columns: readColumns(sqlite, table.name),
      foreignKeys: readForeignKeys(sqlite, table.name),
      name: table.name,
      strict: Number(tableFlags.find(flag => flag.schema === 'main' && flag.name === table.name)?.strict)
    })),
    triggers: schemaObjects.filter((object) => object.type === 'trigger').map(({ name }) => name),
    views: schemaObjects.filter((object) => object.type === 'view').map(({ name }) => name)
  };
}

function signature(value) {
  return JSON.stringify(value);
}

function findMissingEntries(actual, required) {
  const available = new Set(actual.map(signature));
  return required.filter((entry) => !available.has(signature(entry)));
}

function comparableColumns(actual, required) {
  return actual.columns.map((column) => {
    // SQLite INTEGER affinity retains fractional values. These two historical
    // day declarations satisfy the current numeric storage contract too.
    const historicalDay = actual.name === 'node_review' && actual.strict === 0 && column.type === 'INTEGER' &&
      ['elapsed_days', 'scheduled_days'].includes(column.name) &&
      required.columns.some(candidate => candidate.name === column.name && candidate.type === 'REAL');
    return historicalDay ? { ...column, type: 'REAL' } : column;
  });
}

export function findMissingDatabaseCapabilities(actual, required) {
  const missing = [];
  for (const requiredTable of required.tables) {
    const actualTable = actual.tables.find((table) => table.name === requiredTable.name);
    if (!actualTable) {
      missing.push(`table:${requiredTable.name}`);
      continue;
    }
    for (const column of findMissingEntries(comparableColumns(actualTable, requiredTable), requiredTable.columns)) {
      missing.push(`column:${requiredTable.name}.${column.name}`);
    }
    for (const key of findMissingEntries(actualTable.foreignKeys, requiredTable.foreignKeys)) {
      missing.push(`foreign-key:${requiredTable.name}:${signature(key)}`);
    }
  }
  for (const index of findMissingEntries(actual.indexes, required.indexes)) missing.push(`index:${index.name}`);
  for (const trigger of findMissingEntries(actual.triggers, required.triggers)) missing.push(`trigger:${trigger}`);
  for (const view of findMissingEntries(actual.views, required.views)) missing.push(`view:${view}`);
  return missing;
}
