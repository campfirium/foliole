import type Database from 'better-sqlite3';

type Dump = Record<string, string[]>;

/** Every row of every table, as sorted JSON, with the values that are random or use SQLite's own clock blanked. */
export function dumpCompanionTables(database: Database.Database): Dump {
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  return Object.fromEntries(tables.map(({ name }) => {
    const rows = database.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[];
    // Folder backup revisions, the library epoch and the order writer identity derived from it (with the order
    // hashes that include it) are random;
    // article registrations use SQLite's own clock.
    return [name, rows.map(row => JSON.stringify(row, (key, value: unknown) =>
      key === 'registered_at' || key.endsWith('_epoch') || (name === 'parent_order_sources' && key === 'author_id')
        || (row.object_type === 'parent_child_order' && key === 'content_hash') ? null : row.key === 'folder_backup_source_revision' && key === 'value' ? 'revision'
        : value instanceof Uint8Array || Buffer.isBuffer(value) ? Buffer.from(value as Uint8Array).toString('base64') : value)).sort()];
  }));
}

/** The rows each table gained and lost between two dumps. */
export function changedCompanionRows(before: Dump, after: Dump) {
  return Object.fromEntries(Object.keys(after).map(table => {
    const was = new Set(before[table] ?? []);
    const now = new Set(after[table]);
    return [table, { added: after[table]!.filter(row => !was.has(row)), removed: [...was].filter(row => !now.has(row)) }];
  }));
}
