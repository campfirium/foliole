import type { NativeWatchedFolderBinding } from '../../lib/platform/nativeWatchedFolderContract.js';

import { openDatabaseConnection } from './connection.js';
import { resolveWatchedHistoricalSourceRef } from './watchedHistoricalSourceMapping.js';

export function projectEffectiveWatchedSources(
  bindings: NativeWatchedFolderBinding[], localDeviceId: string | null
) {
  const activeRefs = new Set(bindings.map((binding) => binding.source_ref));
  const merged = bindings.filter((binding) => {
    const canonical = resolveWatchedHistoricalSourceRef(binding.source_ref);
    return canonical !== binding.source_ref && activeRefs.has(canonical);
  });
  const mergedIds = new Set(merged.map((binding) => binding.binding_id));
  const localMergedIds = merged.filter((binding) =>
    binding.owner_device_identity_key === localDeviceId).map((binding) => binding.binding_id);
  const localRules = localMergedIds.length ? openDatabaseConnection().driver.queryAll<{
    binding_id: string; local_rule_id: string | null
  }>(
    `SELECT binding_id, local_rule_id FROM watched_folder_bindings
     WHERE binding_id IN (${localMergedIds.map(() => '?').join(',')})`, localMergedIds
  ) : [];
  return {
    bindings: bindings.filter((binding) => !mergedIds.has(binding.binding_id)),
    merged_local_rule_ids: localRules.flatMap((row) => row.local_rule_id ? [row.local_rule_id] : [])
  };
}
