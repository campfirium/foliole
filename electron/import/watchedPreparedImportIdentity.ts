import type { PreparedImportRecord } from '../../lib/core/import/contract.js';
import { createTrackedDesktopSourceFingerprint } from '../../lib/core/import/fingerprint.js';
import { openDatabaseConnection } from '../database/connection.js';
import { resolveExecutableWatchedBinding } from '../database/watchedFolderBindings.js';
import {
  loadHistoricalRefsForWatchedBinding,
  normalizeWatchedRelativeLocation
} from '../database/watchedHistoricalSourceMapping.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import type { KeepImportRuleConfig } from './keepImportService.js';

export function applyWatchedPreparedImportIdentity(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  prepared: PreparedImportRecord
) {
  if (config.sourceType === 'readwise') return prepared;
  const binding = resolveExecutableWatchedBinding(config.ruleId, config.directoryPath);
  if (!binding.bindingId) return prepared;
  if (!binding.executable) throw new Error('source_not_owned_by_current_host');
  const relativePath = normalizeWatchedRelativeLocation(source.sourceName);
  if (!relativePath) throw new Error('watched_relative_path_invalid');
  const existing = openDatabaseConnection().driver.queryOne<{ source_fingerprint: string }>(
    `SELECT source_fingerprint FROM import_sources
     WHERE watched_binding_id = ? AND watched_relative_path = ? LIMIT 1`,
    [binding.bindingId, relativePath]
  );
  const historicalRefs = existing ? [] : loadHistoricalRefsForWatchedBinding(binding.bindingId);
  const historical = historicalRefs.length ? openDatabaseConnection().driver.queryAll<{
    source_fingerprint: string; source_location: string
  }>(`SELECT source_fingerprint, source_location FROM import_sources
     WHERE source_ref IN (${historicalRefs.map(() => '?').join(',')})`, historicalRefs)
    .filter((row) => normalizeWatchedRelativeLocation(row.source_location) === relativePath) : [];
  if (historical.length > 1) throw new Error('watched_history_ambiguous');
  const sourceFingerprint = existing?.source_fingerprint ?? historical[0]?.source_fingerprint ??
    createTrackedDesktopSourceFingerprint(
    `watched:${JSON.stringify([binding.bindingId, relativePath])}`
  );
  return { ...prepared, sourceFingerprint };
}
