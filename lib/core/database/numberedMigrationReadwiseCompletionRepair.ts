import { READWISE_SOURCE_CUTOVER_COMPLETION_VERSION } from '../readwise/readwiseSourceCutover.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';
import { invalidateLegacyReadwiseSourceCompletion } from './readwiseSourceModeMigration.js';

const CUTOVER_KEY = 'readwise_source_cutover_v2';

export function reopenIncompleteReadwiseCompletion(
  sqlite: DatabaseMigrationTarget,
  now = new Date().toISOString()
) {
  if (!tableExists(sqlite, 'settings') || !tableExists(sqlite, 'import_sources')) return;
  const row = sqlite.prepare('SELECT value FROM settings WHERE key = ? LIMIT 1')
    .all(CUTOVER_KEY)[0] as { value?: string } | undefined;
  const cutover = parseRecord(row?.value);
  if (cutover.version !== 2 || cutover.status !== 'api'
    || typeof cutover.completionVersion !== 'number'
    || cutover.completionVersion >= READWISE_SOURCE_CUTOVER_COMPLETION_VERSION) return;
  if (!needsRepair(sqlite, cutover)) {
    writeCutover(sqlite, { ...cutover, completionVersion: READWISE_SOURCE_CUTOVER_COMPLETION_VERSION }, now);
    return;
  }
  const reopened: Record<string, unknown> = {
    ...cutover,
    annotations: [],
    batchId: `cutover-v${cutover.completionVersion}-recovery:${now}`,
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

function needsRepair(sqlite: DatabaseMigrationTarget, cutover: Record<string, unknown>) {
  const failures = Array.isArray(cutover.failures) ? cutover.failures : [];
  if (failures.length > 0) return true;
  const boundIds = new Set((Array.isArray(cutover.documents) ? cutover.documents : []).flatMap((item) => {
    const value = record(item);
    return value.status === 'bound' && typeof value.remoteId === 'string' ? [value.remoteId] : [];
  }));
  if (boundIds.size === 0) return false;
  const sources = sqlite.prepare(`SELECT remote_document_id, remote_import_state_json FROM import_sources
    WHERE remote_provider = 'readwise' AND remote_document_id IS NOT NULL`).all() as Array<{
      remote_document_id: string;
      remote_import_state_json: string;
    }>;
  return sources.some((source) => {
    if (!boundIds.has(source.remote_document_id)) return false;
    const state = record(parse(source.remote_import_state_json));
    return record(state.metadata).category === 'epub' && state.bodyAuthority !== 'original_epub';
  });
}

function writeCutover(sqlite: DatabaseMigrationTarget, value: Record<string, unknown>, now: string) {
  sqlite.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?')
    .run(JSON.stringify(value), now, CUTOVER_KEY);
}

function parseRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'string' ? record(parse(value)) : {};
}

function parse(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
