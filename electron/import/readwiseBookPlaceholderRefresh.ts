import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { openDatabaseConnection } from '../database/connection.js';

import { buildReadwiseBookPlaceholderContent, buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import type { ReadwiseBookInventoryItem } from './readwiseBooksInventory.js';

export function refreshReadwiseBookPlaceholderNode(book: ReadwiseBookInventoryItem) {
  const placeholderNodeId = buildReadwiseBookPlaceholderNodeId(book.bookKey);
  if (book.generatedNodeId !== placeholderNodeId) {
    return false;
  }
  const connection = openDatabaseConnection();
  return connection.driver.transaction(() => {
    return applyParentContentChange({
      driver: connection.driver,
      nextContent: buildReadwiseBookPlaceholderContent(book),
      nodeId: placeholderNodeId,
      updatedAt: new Date().toISOString()
    }).written;
  });
}
