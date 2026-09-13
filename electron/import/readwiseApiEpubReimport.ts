import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';
import type { NativeDevReimportCurrentTopicSourceResult } from '../../lib/platform/nativeImportContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadStagedReadwiseApiContracts } from '../database/readwiseApiImportState.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import {
  prepareReadwiseApiEpubCoverIfNeeded,
  prepareReadwiseApiEpubImagesIfNeeded
} from './readwiseApiEpubImagePreparation.js';
import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';

export async function reimportReadwiseApiEpubSource(
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
  if (document?.category !== 'epub' || !document.epubStructure) {
    return {
      detail: 'Refresh the Readwise preview before re-importing this EPUB.',
      node_id: nodeId,
      reimported_at: reimportedAt,
      status: 'failed'
    };
  }
  const config = loadImportManagerSettings().readwiseReaderConfig;
  const preparation = {
    config, connectionRef: source.remote_connection_ref, destination: 'inbox' as const,
    document, forceEpubStructure: true
  };
  const [preparedEpubCover, preparedEpubImages] = await Promise.all([
    prepareReadwiseApiEpubCoverIfNeeded(preparation),
    prepareReadwiseApiEpubImagesIfNeeded(preparation)
  ]);
  const result = materializeReadwiseApiDocument({
    ...preparation, importedAt: reimportedAt, preparedEpubCover, preparedEpubImages
  });
  return result.status === 'imported'
    ? { detail: 'Readwise API EPUB rebuilt from Reader HTML.', node_id: nodeId, reimported_at: reimportedAt,
        status: 'reimported' }
    : { detail: 'Readwise API EPUB re-import failed.', node_id: null, reimported_at: reimportedAt, status: 'failed' };
}
