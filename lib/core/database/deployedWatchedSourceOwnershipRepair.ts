import { DESKTOP_SOURCE_SCHEMA_STATEMENTS } from './desktopSourceSchemaStatements.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing, columnExists, tableExists } from './numberedMigrationHelpers.js';

interface DeployedBindingRow {
  archive_path: string;
  binding_id: string;
  claim_state: string;
  created_at: string;
  enabled: number;
  highlight_path: string;
  owner_device_name: string | null;
  owner_platform: string | null;
  primary_path: string;
  source_ref: string | null;
  updated_at: string;
}

export function repairDeployedWatchedSourceOwnership(
  sqlite: DatabaseMigrationTarget,
  localHostName: string | null
) {
  if (!tableExists(sqlite, 'watched_folder_bindings')
    || !columnExists(sqlite, 'watched_folder_bindings', 'claim_state')) return;
  if (!tableExists(sqlite, 'desktop_sources')) {
    for (const statement of DESKTOP_SOURCE_SCHEMA_STATEMENTS) sqlite.exec(statement);
  }
  addColumnIfMissing(sqlite, 'watched_folder_bindings', 'source_ref', 'TEXT');
  const rows = sqlite.prepare(`SELECT binding_id, owner_device_name, owner_platform, claim_state,
    action_mode, archive_path, highlight_mode, highlight_path, primary_path, enabled,
    created_at, updated_at, source_ref FROM watched_folder_bindings`).all() as DeployedBindingRow[];
  for (const row of rows) repairBindingSource(sqlite, row, localHostName);
  addColumnIfMissing(sqlite, 'watched_folder_bindings', 'connection_status',
    "TEXT NOT NULL DEFAULT 'needs-folder'");
  sqlite.exec(`UPDATE watched_folder_bindings SET connection_status = 'connected'
    WHERE owner_device_name IS NOT NULL AND TRIM(owner_device_name) <> ''
      AND claim_state IN ('proposed', 'claimed')`);
}

function repairBindingSource(
  sqlite: DatabaseMigrationTarget,
  row: DeployedBindingRow,
  localHostName: string | null
) {
  const existing = sqlite.prepare(`SELECT source_ref FROM desktop_sources
    WHERE source_type = 'watched' AND config_ref = ?`).all(row.binding_id)[0] as
      { source_ref: string } | undefined;
  const sourceRef = existing?.source_ref ?? `watched:${row.binding_id}`;
  if (!existing) {
    const settings = JSON.stringify({ archivePath: row.archive_path,
      highlightPath: row.highlight_path, keepState: row.enabled === 1 ? 'enabled' : 'draft', kind: null });
    sqlite.prepare(`INSERT INTO desktop_sources (source_ref, source_type, config_ref,
      host_name, host_platform, root_path, path_flavor, type_settings_json, created_at, updated_at)
      VALUES (?, 'watched', ?, ?, ?, ?, ?, ?, ?, ?)`).run(sourceRef, row.binding_id,
      row.owner_device_name?.trim() || localHostName || 'unknown-host',
      row.owner_platform?.trim() || process.platform, row.primary_path, pathFlavor(row.primary_path),
      settings, row.created_at, row.updated_at);
  }
  sqlite.prepare('UPDATE watched_folder_bindings SET source_ref = ? WHERE binding_id = ?')
    .run(sourceRef, row.binding_id);
}

function pathFlavor(rootPath: string) {
  return /^[A-Za-z]:[\\/]/u.test(rootPath) || rootPath.includes('\\') ? 'windows' : 'posix';
}
