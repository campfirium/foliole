import type { PreparedImportRecord } from '../../lib/core/import/contract.js';
import { createTrackedDesktopSourceFingerprint } from '../../lib/core/import/fingerprint.js';
import { openDatabaseConnection } from '../database/connection.js';
import { resolveExecutableWatchedBinding } from '../database/watchedFolderBindings.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import type { KeepImportRuleConfig } from './keepImportService.js';

function normalizedRelativePath(value: string) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function applyWatchedPreparedImportIdentity(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  prepared: PreparedImportRecord
) {
  if (config.sourceType === 'readwise') return prepared;
  const binding = resolveExecutableWatchedBinding(config.ruleId, config.directoryPath);
  if (!binding.bindingId) return prepared;
  if (!binding.executable) throw new Error('source_not_connected_to_this_device');
  const relativePath = normalizedRelativePath(source.sourceName);
  const existing = openDatabaseConnection().driver.queryOne<{ source_fingerprint: string }>(
    `SELECT source_fingerprint FROM import_sources
     WHERE watched_binding_id = ? AND watched_relative_path = ? LIMIT 1`,
    [binding.bindingId, relativePath]
  );
  const sourceFingerprint = existing?.source_fingerprint ?? createTrackedDesktopSourceFingerprint(
    `watched:${JSON.stringify([binding.bindingId, relativePath])}`
  );
  return { ...prepared, sourceFingerprint };
}
