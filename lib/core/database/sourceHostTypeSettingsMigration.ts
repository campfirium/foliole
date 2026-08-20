import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';

interface StoredSetting { value: string }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readImportManagerSettings(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'settings')) return {};
  const row = sqlite.prepare("SELECT value FROM settings WHERE key = 'import_manager_settings'")
    .all()[0] as StoredSetting | undefined;
  if (!row) return {};
  try { return asRecord(JSON.parse(row.value)); } catch { return {}; }
}

function sourceSettings(source: Record<string, unknown>) {
  return {
    archivePath: typeof source.archivePath === 'string' ? source.archivePath : '',
    highlightPath: typeof source.highlightPath === 'string' ? source.highlightPath : '',
    keepState: typeof source.keepState === 'string' ? source.keepState : 'draft',
    kind: typeof source.kind === 'string' ? source.kind : null
  };
}

export function migrateSourceHostTypeSettings(sqlite: DatabaseMigrationTarget) {
  const settings = readImportManagerSettings(sqlite);
  for (const [sourceType, key] of [['watched', 'sources'], ['readwise', 'readwiseSources']] as const) {
    const sources = Array.isArray(settings[key]) ? settings[key] : [];
    for (const value of sources) {
      const source = asRecord(value);
      const configRef = typeof source.id === 'string' ? source.id.trim() : '';
      if (!configRef) continue;
      sqlite.prepare(`UPDATE desktop_sources SET type_settings_json = ?
        WHERE source_type = ? AND config_ref = ?`)
        .run(JSON.stringify(sourceSettings(source)), sourceType, configRef);
    }
  }
}
