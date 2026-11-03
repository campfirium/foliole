import { buildAssetMarkdownUrl } from '../../../platform/assetMarkdownUrl.js';
import type { NodeResourceReference } from '../../database/nodeResourceReferences.js';
import type { PreparedImportEmbeddedImage } from '../contract.js';
import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../markdownImageReferences.js';

interface PreparedImportNodeContent { content: string; embeddedImages: PreparedImportEmbeddedImage[] }
type ImageResult = { status: 'error'; message: string } | { status: 'imported'; storage_key: string; original_name: string };

export async function rewriteEpubEmbeddedImages(node: PreparedImportNodeContent, importImage: (image: PreparedImportEmbeddedImage) => Promise<ImageResult>) {
  const imagesByDestination = new Map(node.embeddedImages.map((image) => [image.destination, image] as const));
  const degradedMessages: string[] = [];
  const resources: NodeResourceReference[] = [];
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

    const importedImage = await importImage(image);
    if (importedImage.status === 'error') {
      degradedMessages.push(importedImage.message);
      rewrittenContent += reference.fullMatch;
      continue;
    }

    resources.push({ storage_key: importedImage.storage_key, original_name: importedImage.original_name, role: 'image' });
    const suffix = parsedTarget.suffix ? ` ${parsedTarget.suffix}` : '';
    rewrittenContent += `![${reference.altText}](${buildAssetMarkdownUrl(importedImage.storage_key)}${suffix})`;
  }

  rewrittenContent += node.content.slice(previousEnd);
  return { rewrittenContent, degradedMessages, resources };

}
