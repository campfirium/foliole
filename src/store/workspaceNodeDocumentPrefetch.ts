import { DocumentPreparationQueue } from '../shared/lib/documents/documentPreparation';

import {
  readCachedWorkspaceNodeDocument,
  resetWorkspaceNodeDocumentCacheForTest
} from './workspaceNodeDocumentCache';
import {
  hasPendingNodeDocumentLoad,
  loadWorkspaceNodeDocument,
  resetWorkspaceNodeDocumentLoaderForTest,
  shouldSkipNodeDocumentPreparation
} from './workspaceNodeDocumentLoader';

const preparation = new DocumentPreparationQueue(
  nodeId => hasPendingNodeDocumentLoad(nodeId) || shouldSkipNodeDocumentPreparation(nodeId)
    || Boolean(readCachedWorkspaceNodeDocument(nodeId)),
  nodeId => loadWorkspaceNodeDocument(nodeId, {})
);

export function requestWorkspaceNodeDocumentPreload(nodeIds: readonly string[]) {
  preparation.request(nodeIds);
}

export function resetWorkspaceNodeDocumentPrefetchForTest() {
  preparation.clear();
  resetWorkspaceNodeDocumentLoaderForTest();
  resetWorkspaceNodeDocumentCacheForTest();
}
