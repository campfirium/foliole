import { loadWorkspaceNodeDocument as loadWorkspaceNodeDocumentViaDriver } from '../../lib/core/database/workspaceNodeDocument.js';

import { openDatabaseConnection } from './connection.js';

export function loadWorkspaceNodeDocument(nodeId: string) {
  return loadWorkspaceNodeDocumentViaDriver(openDatabaseConnection().driver, nodeId);
}
