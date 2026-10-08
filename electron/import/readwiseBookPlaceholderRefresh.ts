import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
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
    applyParentContentChange({
      driver: connection.driver,
      nextContent: buildReadwiseBookPlaceholderContent(book),
      nodeId: placeholderNodeId,
      updatedAt: new Date().toISOString()
    });
  });
}
