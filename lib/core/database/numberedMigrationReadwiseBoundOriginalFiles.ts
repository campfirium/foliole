import { READWISE_SOURCE_CUTOVER_COMPLETION_VERSION } from '../readwise/readwiseSourceCutover.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';
import { invalidateLegacyReadwiseSourceCompletion } from './readwiseSourceModeMigration.js';

const CUTOVER_KEY = 'readwise_source_cutover_v2';

export function reopenReadwiseBoundOriginalFiles(
  sqlite: DatabaseMigrationTarget,
  now = new Date().toISOString()
) {
  if (!tableExists(sqlite, 'settings') || !tableExists(sqlite, 'import_sources')) return;
  const row = sqlite.prepare('SELECT value FROM settings WHERE key = ? LIMIT 1')
    .all(CUTOVER_KEY)[0] as { value?: string } | undefined;
  const cutover = parseRecord(row?.value);
  if (cutover.version !== 2 || cutover.status !== 'api' || cutover.completionVersion !== 3) return;
  if (!hasBoundFileDocument(sqlite, cutover.documents)) {
    writeCutover(sqlite, { ...cutover, completionVersion: READWISE_SOURCE_CUTOVER_COMPLETION_VERSION }, now);
    return;
  }
  const reopened: Record<string, unknown> = {
    ...cutover,
    annotations: [],
    batchId: `bound-original-file-recovery:${now}`,
    cohortDocumentIds: [],
    completedAt: now,
    documents: [],
    phase: 'indexing',
    startedAt: now,
    status: 'migration-in-progress'
  };
  for (const key of ['activeDocument', 'completionVersion', 'errorReason', 'failures']) delete reopened[key];
  writeCutover(sqlite, reopened, now);
  invalidateLegacyReadwiseSourceCompletion(sqlite, now);
}

function hasBoundFileDocument(sqlite: DatabaseMigrationTarget, documents: unknown) {
  const boundIds = new Set(Array.isArray(documents) ? documents.flatMap((item) => {
    const row = record(item);
    return row.status === 'bound' && typeof row.remoteId === 'string' ? [row.remoteId] : [];
  }) : []);
  if (boundIds.size === 0) return false;
  const sources = sqlite.prepare(`SELECT remote_document_id, remote_import_state_json FROM import_sources
    WHERE remote_provider = 'readwise' AND remote_document_id IS NOT NULL`).all() as Array<{
      remote_document_id: string;
      remote_import_state_json: string;
    }>;
  return sources.some((source) => {
    if (!boundIds.has(source.remote_document_id)) return false;
    const category = record(parse(source.remote_import_state_json)).metadata;
    const value = record(category).category;
    return value === 'pdf' || value === 'epub';
  });
}

function writeCutover(sqlite: DatabaseMigrationTarget, value: Record<string, unknown>, now: string) {
  sqlite.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?')
    .run(JSON.stringify(value), now, CUTOVER_KEY);
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return {};
  try { return record(JSON.parse(value)); } catch { return {}; }
}

function parse(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
