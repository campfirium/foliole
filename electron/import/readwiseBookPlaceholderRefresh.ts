import { enqueueWorkspaceSearchInvalidationForNodeIds } from '../../lib/core/database/searchIndexInvalidations.js';
import { openDatabaseConnection } from '../database/connection.js';

import { buildReadwiseBookPlaceholderContent, buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import type { ReadwiseBookInventoryItem } from './readwiseBooksInventory.js';

export function refreshReadwiseBookPlaceholderNode(book: ReadwiseBookInventoryItem) {
  const placeholderNodeId = buildReadwiseBookPlaceholderNodeId(book.bookKey);
  if (book.generatedNodeId !== placeholderNodeId) {
    return;
  }
  const connection = openDatabaseConnection();
  connection.driver.transaction(() => {
    connection.sqlite
      .prepare('UPDATE nodes SET content = ?, opening_text = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(buildReadwiseBookPlaceholderContent(book), null, new Date().toISOString(), placeholderNodeId);
    enqueueWorkspaceSearchInvalidationForNodeIds(connection.driver, [placeholderNodeId]);
  });
}
