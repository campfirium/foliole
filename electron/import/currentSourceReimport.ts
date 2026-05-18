import type { NativeDevReimportCurrentTopicSourceResult } from '../../lib/platform/nativeImportContract.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { loadNodeSourceDetails } from '../database/nodeSourceDetails.js';

import { processSearchIndexForKeepImportSource } from './keepImportIndexingProgress.js';
import { buildKeepImportSourceDescriptor, resolveKeepImportRuleConfig } from './keepImportManualSource.js';
import { loadPreparedKeepImportRecord, resolveKeepImportSourceSignature } from './keepImportPreparedRecord.js';
import { persistKeepImportState } from './keepImportServiceState.js';
import { resolveKeepImportResultDetail, resolveKeepImportResultStatus } from './keepImportSourceUpdateState.js';

export async function reimportCurrentTopicSource(nodeId: string): Promise<NativeDevReimportCurrentTopicSourceResult> {
  const reimportedAt = new Date().toISOString();
  const details = loadNodeSourceDetails(nodeId, 1);
  const item = details?.keepImportItem;
  if (!details || !item || item.local_node_state !== 'active') {
    return {
      detail: 'Selected topic is not backed by an active keep import source.',
      node_id: null,
      reimported_at: reimportedAt,
      status: 'unavailable'
    };
  }
  const config = resolveKeepImportRuleConfig(item.rule_id);
  if (!config) {
    return {
      detail: 'The watch folder for this source is no longer configured.',
      node_id: null,
      reimported_at: reimportedAt,
      status: 'failed'
    };
  }
  try {
    const source = await buildKeepImportSourceDescriptor(config, item.source_path);
    const sourceSignature = await resolveKeepImportSourceSignature(config, source);
    const prepared = await loadPreparedKeepImportRecord(config, source, reimportedAt);
    const record = runPreparedImport(prepared, {
      forceUpdateExistingNodeId: details.sourceNodeId,
      resetImportedStructure: true
    });
    const indexedRecord = processSearchIndexForKeepImportSource({
      onProgress: undefined,
      record,
      sourceName: source.sourceName
    });
    const importStatus = resolveKeepImportResultStatus(indexedRecord);
    persistKeepImportState(config, source, sourceSignature, indexedRecord, importStatus, false);
    if (indexedRecord.resultStatus === 'failed' || !indexedRecord.nodeId) {
      return {
        detail: indexedRecord.failureReason ?? 'Re-import did not update a topic.',
        node_id: indexedRecord.nodeId,
        reimported_at: reimportedAt,
        status: 'failed'
      };
    }
    return {
      detail: resolveKeepImportResultDetail(indexedRecord, importStatus),
      node_id: indexedRecord.nodeId,
      reimported_at: reimportedAt,
      status: 'reimported'
    };
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : 'Unknown re-import failure',
      node_id: null,
      reimported_at: reimportedAt,
      status: 'failed'
    };
  }
}
