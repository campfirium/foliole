import { loadWorkspaceNodeDocument as loadWorkspaceNodeDocumentViaDriver } from '../../lib/core/database/workspaceNodeDocument.js';

import { openDatabaseConnection } from './connection.js';
import { consumePreparedDesktopFlowDocument } from './dailyFlowDocumentPreparation.js';

export function loadWorkspaceNodeDocument(nodeId: string) {
  return consumePreparedDesktopFlowDocument(nodeId) ?? loadWorkspaceNodeDocumentViaDriver(openDatabaseConnection().driver, nodeId);
}
