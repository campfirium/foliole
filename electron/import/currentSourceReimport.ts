import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';
import type { NativeDevReimportCurrentTopicSourceResult } from '../../lib/platform/nativeImportContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { loadNodeSourceDetails } from '../database/nodeSourceDetails.js';
import { loadStagedReadwiseApiContracts } from '../database/readwiseApiImportState.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { processSearchIndexForKeepImportSource } from './keepImportIndexingProgress.js';
import { buildKeepImportSourceDescriptor, resolveKeepImportRuleConfig } from './keepImportManualSource.js';
import { loadPreparedKeepImportRecord, resolveKeepImportSourceSignature } from './keepImportPreparedRecord.js';
import { persistKeepImportState } from './keepImportServiceState.js';
import { resolveKeepImportResultDetail, resolveKeepImportResultStatus } from './keepImportSourceUpdateState.js';
import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import { resetReadwiseBookImportFromInventory } from './readwiseBookImportReset.js';
import { refreshReadwiseBookPlaceholderNode } from './readwiseBookPlaceholderRefresh.js';
import { loadReadwiseBooksInventoryForPaths } from './readwiseBooksInventoryLoad.js';
import { findPersistedReadwiseBookByNodeId } from './readwiseBooksInventoryState.js';
import type { EnabledReadwiseBooksSource } from './readwiseReaderBooksRun.js';
import { applyWatchedPreparedImportIdentity } from './watchedPreparedImportIdentity.js';

async function reimportReadwiseApiEpubSource(
  nodeId: string,
  reimportedAt: string
): Promise<NativeDevReimportCurrentTopicSourceResult | null> {
  const source = openDatabaseConnection().driver.queryOne<{
    remote_connection_ref: string;
    remote_document_id: string;
  }>(
    `SELECT remote_connection_ref, remote_document_id FROM import_sources
     WHERE latest_node_id = ? AND remote_provider = 'readwise' AND source_kind = 'html'
       AND json_extract(remote_import_state_json, '$.metadata.category') = 'epub'`, [nodeId]
  );
  if (!source) return null;
  const staged = loadStagedReadwiseApiContracts(source.remote_connection_ref);
  const document = prepareReadwiseApiDocuments(staged.readerDocuments, staged.exportBooks)
    .find((candidate) => candidate.id === source.remote_document_id);
  if (document?.category !== 'epub' || !document.epubStructure?.sections.length) {
    return {
      detail: 'Refresh the Readwise preview before re-importing this EPUB.',
      node_id: nodeId,
      reimported_at: reimportedAt,
      status: 'failed' as const
    };
  }
  const result = materializeReadwiseApiDocument({
    config: loadImportManagerSettings().readwiseReaderConfig,
    connectionRef: source.remote_connection_ref,
    document,
    forceEpubStructure: true,
    importedAt: reimportedAt
  });
  if (result.status === 'imported') {
    return {
      detail: 'Readwise API EPUB rebuilt from Reader HTML.',
      node_id: nodeId,
      reimported_at: reimportedAt,
      status: 'reimported'
    };
  }
  return {
    detail: 'Readwise API EPUB re-import failed.',
    node_id: null,
    reimported_at: reimportedAt,
    status: 'failed'
  };
}

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
  const readwiseApiResult = await reimportReadwiseApiEpubSource(nodeId, reimportedAt);
  if (readwiseApiResult) {
    return readwiseApiResult;
  }
  const readwiseBookResult = await reimportReadwiseBookSource(nodeId, reimportedAt);
  if (readwiseBookResult) {
    return readwiseBookResult;
  }
  return reimportKeepImportTopicSource(nodeId, reimportedAt);
}
