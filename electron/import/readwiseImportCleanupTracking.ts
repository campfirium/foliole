import { openDatabaseConnection } from '../database/connection.js';

import { loadImportManagerSettings } from './importManagerSettings.js';

export function readReadwiseRuleIds() {
  return new Set(
    loadImportManagerSettings()
      .readwiseSources
      .filter((source) => source.kind)
      .map((source) => source.id)
  );
}

export function clearReadwiseTracking(input: { deletedNodeIds: string[]; detachedNodeIds: string[] }) {
  const connection = openDatabaseConnection();
  const ruleIds = readReadwiseRuleIds();
  const deleteTrackingOnlyKeepImport = connection.sqlite.prepare(
    'DELETE FROM keep_import_items WHERE rule_id = ? AND last_node_id IS NULL'
  );
  const deleteKeepImport = connection.sqlite.prepare('DELETE FROM keep_import_items WHERE last_node_id = ?');
  const deleteImportRuns = connection.sqlite.prepare('DELETE FROM import_runs WHERE node_id = ?');
  const deleteImportSources = connection.sqlite.prepare('DELETE FROM import_sources WHERE latest_node_id = ?');
  connection.sqlite.transaction(() => {
    ruleIds.forEach((ruleId) => {
      deleteTrackingOnlyKeepImport.run(ruleId);
    });
    input.detachedNodeIds.forEach((nodeId) => {
      deleteKeepImport.run(nodeId);
    });
    [...input.detachedNodeIds, ...input.deletedNodeIds].forEach((nodeId) => {
      deleteImportRuns.run(nodeId);
      deleteImportSources.run(nodeId);
    });
  })();
}
