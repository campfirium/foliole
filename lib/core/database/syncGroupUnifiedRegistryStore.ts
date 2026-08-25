import {
  EMPTY_UNIFIED_INSTALLATION_REGISTRY,
  type UnifiedInstallationRegistrySnapshot
} from '../../platform/syncGroupUnifiedContract.js';
import type { DbPort } from '../sync/dbPort.js';

export interface UnifiedInstallationRegistryPort {
  read(): Promise<UnifiedInstallationRegistrySnapshot>;
  write(snapshot: UnifiedInstallationRegistrySnapshot): Promise<void>;
}

export class DbPortUnifiedInstallationRegistry implements UnifiedInstallationRegistryPort {
  constructor(private readonly db: DbPort) {}

  async read() {
    await this.install();
    const rows = await this.db.query<{ snapshot_json: string }>(
      'SELECT snapshot_json FROM foliole_installation_registry WHERE singleton_id = 1'
    );
    if (!rows[0]) return structuredClone(EMPTY_UNIFIED_INSTALLATION_REGISTRY);
    return parseRegistrySnapshot(rows[0].snapshot_json);
  }

  async write(snapshot: UnifiedInstallationRegistrySnapshot) {
    assertRegistrySnapshot(snapshot);
    await this.install();
    await this.db.run(`INSERT OR REPLACE INTO foliole_installation_registry
      (singleton_id, snapshot_json) VALUES (1, ?)`, [JSON.stringify(snapshot)]);
  }

  private async install() {
    await this.db.run(`CREATE TABLE IF NOT EXISTS foliole_installation_registry (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      snapshot_json TEXT NOT NULL
    )`);
    await this.db.run('PRAGMA user_version = 1');
  }
}

function parseRegistrySnapshot(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('installation registry snapshot is invalid JSON');
  }
  assertRegistrySnapshot(parsed);
  return parsed;
}

function assertRegistrySnapshot(value: unknown): asserts value is UnifiedInstallationRegistrySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('installation registry snapshot is invalid');
  }
  const record = value as Record<string, unknown>;
  if (!Number.isSafeInteger(record.revision) || Number(record.revision) < 0 ||
      !(record.installation_id === null || typeof record.installation_id === 'string') ||
      !(record.active_binding === null || isBinding(record.active_binding)) ||
      !(record.journal === null || isJournal(record.journal))) {
    throw new Error('installation registry snapshot is invalid');
  }
}

function isBinding(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return ['group_id', 'installation_id', 'library_id', 'local_member_id', 'timeline_id']
    .every((key) => typeof record[key] === 'string') && record.state === 'active';
}

function isJournal(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.journal_id === 'string' && typeof record.decision_digest === 'string' &&
    typeof record.updated_at === 'string' && typeof record.previous_registry === 'object' &&
    typeof record.secure_snapshot === 'object' &&
    ['prepared', 'databases_applied', 'committed', 'rolling_back'].includes(String(record.phase));
}
