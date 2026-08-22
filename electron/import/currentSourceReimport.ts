import type { NativeDevReimportCurrentTopicSourceResult } from '../../lib/platform/nativeImportContract.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { loadNodeSourceDetails } from '../database/nodeSourceDetails.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { processSearchIndexForKeepImportSource } from './keepImportIndexingProgress.js';
import { buildKeepImportSourceDescriptor, resolveKeepImportRuleConfig } from './keepImportManualSource.js';
import { loadPreparedKeepImportRecord, resolveKeepImportSourceSignature } from './keepImportPreparedRecord.js';
import { persistKeepImportState } from './keepImportServiceState.js';
import { resolveKeepImportResultDetail, resolveKeepImportResultStatus } from './keepImportSourceUpdateState.js';
import { resetReadwiseBookImportFromInventory } from './readwiseBookImportReset.js';
import { refreshReadwiseBookPlaceholderNode } from './readwiseBookPlaceholderRefresh.js';
import { loadReadwiseBooksInventoryForPaths } from './readwiseBooksInventoryLoad.js';
import { findPersistedReadwiseBookByNodeId } from './readwiseBooksInventoryState.js';
import type { EnabledReadwiseBooksSource } from './readwiseReaderBooksRun.js';
import { applyWatchedPreparedImportIdentity } from './watchedPreparedImportIdentity.js';

function isActiveReadwiseBooksSource(source: unknown): source is EnabledReadwiseBooksSource {
  const candidate = source as Partial<EnabledReadwiseBooksSource>;
  return (
    candidate.keepState === 'enabled' &&
    candidate.kind === 'books' &&
    typeof candidate.primaryPath === 'string' &&
    candidate.primaryPath.trim().length > 0 &&
    typeof candidate.highlightPath === 'string' &&
    candidate.highlightPath.trim().length > 0
  );
}

async function reimportReadwiseBookSource(nodeId: string, reimportedAt: string) {
  const target = findPersistedReadwiseBookByNodeId(nodeId);
  if (!target) {
    return null;
  }
  const settings = loadImportManagerSettings();
  const source = settings.readwiseSources.find((candidate): candidate is EnabledReadwiseBooksSource => (
    isActiveReadwiseBooksSource(candidate) &&
    candidate.primaryPath === target.inventory.fullDocumentDirectoryPath &&
    candidate.highlightPath === target.inventory.highlightDirectoryPath
  ));
  if (!source) {
    refreshReadwiseBookPlaceholderNode(target.book);
    return {
      detail: 'The Readwise Books source for this topic is no longer configured.',
      node_id: nodeId,
      reimported_at: reimportedAt,
      status: 'failed' as const
    };
  }
  try {
    const { inventory } = await loadReadwiseBooksInventoryForPaths({
      forceScan: true,
      fullDocumentDirectoryPath: source.primaryPath,
      highlightDirectoryPath: source.highlightPath,
      readwiseConfig: settings.readwiseReaderConfig
    });
    const resetResult = await resetReadwiseBookImportFromInventory(nodeId, inventory);
    if (resetResult.status !== 'reset' || !resetResult.node_id) {
      return {
        detail: resetResult.status === 'book_not_found' ? 'Readwise Books topic was not found in the source.' : 'Readwise Books topic reset failed.',
        node_id: resetResult.node_id,
        reimported_at: reimportedAt,
        status: 'failed' as const
      };
    }
    return {
      detail: 'Readwise Books topic reset from source.',
      node_id: resetResult.node_id,
      reimported_at: reimportedAt,
      status: 'reimported' as const
    };
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : 'Unknown Readwise Books re-import failure',
      node_id: nodeId,
      reimported_at: reimportedAt,
      status: 'failed' as const
    };
  }
}

async function reimportKeepImportTopicSource(nodeId: string, reimportedAt: string): Promise<NativeDevReimportCurrentTopicSourceResult> {
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
    const prepared = applyWatchedPreparedImportIdentity(config, source,
      await loadPreparedKeepImportRecord(config, source, reimportedAt));
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

export async function reimportCurrentTopicSource(nodeId: string): Promise<NativeDevReimportCurrentTopicSourceResult> {
  const reimportedAt = new Date().toISOString();
  const readwiseBookResult = await reimportReadwiseBookSource(nodeId, reimportedAt);
  if (readwiseBookResult) {
    return readwiseBookResult;
  }
  return reimportKeepImportTopicSource(nodeId, reimportedAt);
}
