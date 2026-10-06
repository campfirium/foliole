import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import type { PreparedImportEmbeddedImage } from '../../lib/core/import/contract.js';
import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../lib/core/import/markdownImageReferences.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
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

async function rewriteEmbeddedImages(nodeId: string, node: PreparedImportNodeContent) {
  const imagesByDestination = new Map(node.embeddedImages.map((image) => [image.destination, image] as const));
  const degradedMessages: string[] = [];
  let rewrittenContent = '';
  let previousEnd = 0;

  for (const reference of collectMarkdownImageReferences(node.content)) {
    rewrittenContent += node.content.slice(previousEnd, reference.start);
    previousEnd = reference.end;

    const parsedTarget = parseMarkdownImageTarget(reference.rawTarget);
    const image = parsedTarget ? imagesByDestination.get(parsedTarget.destination) : null;
    if (!parsedTarget || !image) {
      rewrittenContent += reference.fullMatch;
      continue;
    }

    const imagePath = epubImageFilePath(image);
    const importedImage = imagePath ? await importEpubImageFile({
      sourcePath: imagePath, nodeId, originalName: image.originalName, errorSource: image.destination
    }) : await importImageAttachmentBytes({
      bytes: image.bytes,
      errorSource: image.destination,
      mimeType: image.mimeType,
      nodeId,
      originalName: image.originalName
    });
    if (importedImage.status === 'error') {
      degradedMessages.push(importedImage.message);
      rewrittenContent += reference.fullMatch;
      continue;
    }

    const suffix = parsedTarget.suffix ? ` ${parsedTarget.suffix}` : '';
    rewrittenContent += `![${reference.altText}](${buildAssetMarkdownUrl(importedImage.storage_key)}${suffix})`;
  }

  rewrittenContent += node.content.slice(previousEnd);
  return { rewrittenContent, degradedMessages };

}

export async function importEmbeddedImagesForNode<T extends PreparedImportNodeContent>(nodeId: string, importedAt: string, node: T) {
  if (node.embeddedImages.length === 0) {
    return node;
  }

  const { rewrittenContent, degradedMessages } = await rewriteEmbeddedImages(nodeId, node);
  if (rewrittenContent === node.content && degradedMessages.length === 0) return node;

  await runWithDatabaseConnectionOwner(() => {
    const connection = openDatabaseConnection();
    connection.driver.transaction(() => {
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
