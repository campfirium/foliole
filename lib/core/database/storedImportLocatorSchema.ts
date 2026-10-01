const IMPORT_ROWS_SQL = `SELECT source.source_fingerprint,
  lower(replace(CASE WHEN source.source_ref IS NOT NULL AND source.source_location IS NOT NULL
    THEN rtrim(replace(desktop.root_path, char(92), '/'), '/') || '/' || source.source_location ELSE source.source_locator END, char(92), '/')),
  source.latest_node_id, node.deleted_at, source.remote_connection_ref, source.remote_document_id
FROM import_sources source JOIN nodes node ON node.id = source.latest_node_id
LEFT JOIN desktop_sources desktop ON desktop.source_ref = source.source_ref`;

export const STORED_IMPORT_ROWS_SQL = IMPORT_ROWS_SQL;

function importTrigger(event: 'INSERT' | 'UPDATE' | 'DELETE') {
  const remove = event === 'INSERT' ? '' : 'DELETE FROM stored_import_locators WHERE source_fingerprint = old.source_fingerprint;';
  const insert = event === 'DELETE' ? '' : `INSERT OR REPLACE INTO stored_import_locators ${IMPORT_ROWS_SQL}
    WHERE source.source_fingerprint = new.source_fingerprint;`;
  return `CREATE TRIGGER IF NOT EXISTS stored_import_import_sources_${event.toLowerCase()} AFTER ${event} ON import_sources
    BEGIN ${remove} ${insert} END`;
}

function desktopTrigger(event: 'INSERT' | 'UPDATE' | 'DELETE') {
  const ref = event === 'DELETE' ? 'old.source_ref' : 'new.source_ref';
  return `CREATE TRIGGER IF NOT EXISTS stored_import_desktop_sources_${event.toLowerCase()} AFTER ${event} ON desktop_sources
    BEGIN DELETE FROM stored_import_locators WHERE source_fingerprint IN
      (SELECT source_fingerprint FROM import_sources WHERE source_ref = ${ref});
      INSERT OR REPLACE INTO stored_import_locators ${IMPORT_ROWS_SQL} WHERE source.source_ref = ${ref}; END`;
}

export const STORED_IMPORT_LOCATOR_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS stored_import_locators (
    source_fingerprint TEXT PRIMARY KEY, locator TEXT, node_id TEXT NOT NULL, deleted_at TEXT,
    remote_connection_ref TEXT, remote_document_id TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_stored_import_locator ON stored_import_locators(locator)',
  'CREATE INDEX IF NOT EXISTS idx_stored_import_remote ON stored_import_locators(remote_connection_ref, remote_document_id)',
  ...(['INSERT', 'UPDATE', 'DELETE'] as const).flatMap((event) => [importTrigger(event), desktopTrigger(event)]),
  `CREATE TRIGGER IF NOT EXISTS stored_import_nodes_delete AFTER DELETE ON nodes
   BEGIN DELETE FROM stored_import_locators WHERE node_id = old.id; END`,
  `CREATE TRIGGER IF NOT EXISTS stored_import_nodes_update AFTER UPDATE OF deleted_at ON nodes
   BEGIN UPDATE stored_import_locators SET deleted_at = new.deleted_at WHERE node_id = new.id; END`
];
