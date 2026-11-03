import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { parseNodeResourceReferences, serializeNodeResourceReferences } from '../../lib/core/database/nodeResourceReferences.js';
import type { PreparedImportEmbeddedImage } from '../../lib/core/import/contract.js';
import { rewriteEpubEmbeddedImages } from '../../lib/core/import/epub/epubImageReferences.js';
import { importEpubImageFile } from '../attachments/importEpubImageFile.js';
import { importImageAttachmentBytes } from '../attachments/importImageAttachmentBytes.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import { appendReason } from './epubImportResult.js';
import { epubImageFilePath } from './epubStagedContent.js';

interface PreparedImportNodeContent {
  content: string;
  degradedReason: string | null;
  embeddedImages: PreparedImportEmbeddedImage[];
  title: string;
}


export async function importEmbeddedImagesForNode<T extends PreparedImportNodeContent>(nodeId: string, importedAt: string, node: T) {
  if (node.embeddedImages.length === 0) {
    return node;
  }

  const { rewrittenContent, degradedMessages, resources } = await rewriteEpubEmbeddedImages(node, image => {
    const imagePath = epubImageFilePath(image);
    return imagePath ? importEpubImageFile({
      sourcePath: imagePath, nodeId, originalName: image.originalName, errorSource: image.destination
    }) : importImageAttachmentBytes({
      bytes: image.bytes, errorSource: image.destination, mimeType: image.mimeType, nodeId, originalName: image.originalName
    });
  });
  if (rewrittenContent === node.content && degradedMessages.length === 0) return node;

  await runWithDatabaseConnectionOwner(() => {
    const connection = openDatabaseConnection();
    connection.driver.transaction(() => {
      const row = connection.driver.queryOne<{ resource_references: string }>('SELECT resource_references FROM nodes WHERE id = ?', [nodeId]);
      if (!row) throw new Error('image_import_node_unavailable');
      const existing = parseNodeResourceReferences(row.resource_references);
      connection.driver.execute('UPDATE nodes SET resource_references = ? WHERE id = ?',
        [serializeNodeResourceReferences([...new Map([...resources, ...existing].map(reference => [reference.storage_key + reference.role, reference])).values()]), nodeId]);
      writeNodeBody({ driver: connection.driver, content: rewrittenContent, nodeId: nodeId,
        title: node.title, updatedAt: importedAt });
    });
  });

  return {
    ...node,
    content: rewrittenContent,
    degradedReason: degradedMessages.reduce<string | null>(
      (reason, message) => appendReason(reason, message),
      node.degradedReason
    )
  };
}
