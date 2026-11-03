import type { PreparedImportEmbeddedImage } from '../contract.js';
import { createPreparedDesktopTextImport } from '../fingerprint.js';

import type { RawBookNode } from './epubImportTree.js';

export interface PreparedBookNode {
  content: string;
  degradedReason: string | null;
  embeddedImages: PreparedImportEmbeddedImage[];
  hideTitleHeading: boolean;
  key: string;
  parentKey: string | null;
  title: string;
}

export function prepareEpubBookNode(node: RawBookNode, index: number, importedAt: string) {
  const prepared = createPreparedDesktopTextImport({
    content: node.content,
    degradedReason: node.degradedReason,
    fileName: `chapter-${index + 1}.xhtml`,
    filePath: `epub-chapter#${node.key}`,
    importedAt,
    kind: 'epub',
    managedEpubImageDestinations: node.embeddedImages.map((image) => image.destination),
    sourceProfile: 'epub',
    titleStrategy: 'heading'
  });
  const result = {
    content: prepared.content,
    degradedReason: prepared.degradedReason,
    embeddedImages: node.embeddedImages,
    hideTitleHeading: prepared.hideTitleHeading,
    key: node.key,
    parentKey: node.parentKey,
    title: node.title
  } satisfies PreparedBookNode;
  return result;
}

export function buildEpubRootContent(title: string, body: string) {
  const trimmedBody = body.trim();
  return trimmedBody ? `# ${title}\n\n${trimmedBody}` : `# ${title}`;
}
